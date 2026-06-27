-- ── Sync product from slot assignment ────────────────────────
CREATE OR REPLACE FUNCTION public.sync_product_from_schedule_slot(p_slot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_code text;
BEGIN
  SELECT s.*, pt.code AS template_code
  INTO v_slot
  FROM season_schedule_slots s
  LEFT JOIN products p ON p.id = s.product_id
  LEFT JOIN product_templates pt ON pt.id = p.template_id
  WHERE s.id = p_slot_id;

  IF v_slot.product_id IS NULL THEN RETURN; END IF;

  v_code := v_slot.template_code;
  IF v_code = 'annual_section' OR v_code IS NULL THEN
    UPDATE products SET
      day_of_week = v_slot.day_of_week,
      start_time = v_slot.start_time,
      end_time = v_slot.end_time,
      schedule_pattern = jsonb_build_object(
        'type', 'weekly',
        'schedule', jsonb_build_array(jsonb_build_object(
          'day', v_slot.day_of_week,
          'startTime', to_char(v_slot.start_time, 'HH24:MI'),
          'endTime', to_char(v_slot.end_time, 'HH24:MI')
        ))
      )
    WHERE id = v_slot.product_id;
  ELSIF v_code = 'summer_course' THEN
    UPDATE products SET
      start_time = v_slot.start_time,
      end_time = v_slot.end_time,
      schedule_pattern = COALESCE(schedule_pattern, '{}'::jsonb) || jsonb_build_object(
        'type', 'course_series',
        'weekdays', COALESCE(schedule_pattern->'weekdays', jsonb_build_array(v_slot.day_of_week))
      )
    WHERE id = v_slot.product_id;
  END IF;
END;
$$;

-- ── Selective clone (annual only) ────────────────────────────
CREATE OR REPLACE FUNCTION public.clone_season_products(
  p_source_season_id uuid,
  p_target_season_id uuid,
  p_product_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped integer := 0;
  r record;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN json_build_object('result', 'no_products_selected');
  END IF;

  FOR r IN
    SELECT p.*
    FROM products p
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE p.season_id = p_source_season_id
      AND p.id = ANY(p_product_ids)
      AND pt.code = 'annual_section'
    ORDER BY p.name, p.day_of_week, p.start_time
  LOOP
    IF EXISTS (
      SELECT 1 FROM products tp
      JOIN product_templates tpt ON tpt.id = tp.template_id
      WHERE tp.season_id = p_target_season_id
        AND tpt.code = 'annual_section'
        AND public.product_planning_key(
          tp.day_of_week, tp.instructor_name, tp.start_time, tp.end_time, tp.name
        ) = public.product_planning_key(
          r.day_of_week, r.instructor_name, r.start_time, r.end_time, r.name
        )
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO products (
      season_id, template_id, name, day_of_week, start_time, end_time,
      instructor_name, instructor_id, capacity, level, level_label,
      target_audience, gender, schedule_pattern, price
    ) VALUES (
      p_target_season_id, r.template_id, r.name, r.day_of_week, r.start_time, r.end_time,
      r.instructor_name, r.instructor_id, r.capacity, r.level, r.level_label,
      r.target_audience, r.gender, r.schedule_pattern, r.price
    )
    RETURNING id INTO v_new_id;

    INSERT INTO season_schedule_slots (
      season_id, layer, day_of_week, start_time, end_time, product_id, label
    ) VALUES (
      p_target_season_id, 'annual', r.day_of_week, r.start_time, r.end_time,
      v_new_id, r.name
    )
    ON CONFLICT (season_id, layer, day_of_week, start_time) DO UPDATE
      SET product_id = EXCLUDED.product_id, end_time = EXCLUDED.end_time, label = EXCLUDED.label;

    v_created := v_created + 1;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'created', v_created, 'skipped', v_skipped);
END;
$$;

-- ── List cloneable annual products from source season ─────────
CREATE OR REPLACE FUNCTION public.list_source_annual_products(p_source_season_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'day_of_week', p.day_of_week,
        'start_time', p.start_time,
        'end_time', p.end_time,
        'instructor_name', p.instructor_name
      ) ORDER BY p.day_of_week, p.start_time, p.name)
      FROM products p
      JOIN product_templates pt ON pt.id = p.template_id
      WHERE p.season_id = p_source_season_id AND pt.code = 'annual_section'
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Apply intent side-effects (enrollment sync) ──────────────
CREATE OR REPLACE FUNCTION public.apply_participant_intent_enrollment(p_intent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_season record;
  v_enr_id uuid;
BEGIN
  SELECT psi.*, s.start_date, s.end_date, s.active AS season_active
  INTO v_row
  FROM participant_season_intents psi
  JOIN seasons s ON s.id = psi.season_id
  WHERE psi.id = p_intent_id;

  IF v_row.intent = 'confirmed' AND v_row.target_product_id IS NOT NULL THEN
    SELECT id INTO v_enr_id
    FROM enrollments
    WHERE participant_id = v_row.participant_id
      AND product_id = v_row.target_product_id
      AND active = TRUE
    LIMIT 1;

    IF v_enr_id IS NULL THEN
      INSERT INTO enrollments (
        product_id, participant_id, payment_status, valid_from, valid_until, active
      ) VALUES (
        v_row.target_product_id, v_row.participant_id, 'unpaid',
        v_row.start_date, v_row.end_date, TRUE
      )
      RETURNING id INTO v_enr_id;
    END IF;

    UPDATE participant_season_intents
    SET enrollment_id = v_enr_id, updated_at = NOW()
    WHERE id = p_intent_id;

  ELSIF v_row.intent IN ('refused', 'undecided') AND v_row.enrollment_id IS NOT NULL THEN
    PERFORM public.cancel_enrollment(v_row.enrollment_id);
    UPDATE participant_season_intents
    SET enrollment_id = NULL, updated_at = NOW()
    WHERE id = p_intent_id;
  END IF;
END;
$$;

-- ── Set participant continuation intent ──────────────────────
CREATE OR REPLACE FUNCTION public.set_participant_intent(
  p_season_id uuid,
  p_participant_id uuid,
  p_intent text,
  p_target_product_id uuid DEFAULT NULL,
  p_source_product_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_intent text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_intent := COALESCE(p_intent, 'undecided');
  IF v_intent NOT IN ('confirmed', 'refused', 'undecided') THEN
    RETURN json_build_object('result', 'invalid_intent');
  END IF;

  INSERT INTO participant_season_intents (
    season_id, participant_id, intent, source_product_id, target_product_id
  ) VALUES (
    p_season_id, p_participant_id, v_intent, p_source_product_id, p_target_product_id
  )
  ON CONFLICT (season_id, participant_id) DO UPDATE SET
    intent = EXCLUDED.intent,
    source_product_id = COALESCE(EXCLUDED.source_product_id, participant_season_intents.source_product_id),
    target_product_id = COALESCE(EXCLUDED.target_product_id, participant_season_intents.target_product_id),
    updated_at = NOW()
  RETURNING id INTO v_id;

  PERFORM public.apply_participant_intent_enrollment(v_id);

  RETURN json_build_object('result', 'ok', 'intent_id', v_id);
END;
$$;

-- ── Carry forward as undecided intents (not enrollments) ─────
CREATE OR REPLACE FUNCTION public.carry_forward_intents(
  p_source_season_id uuid,
  p_target_season_id uuid,
  p_dry_run boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped integer := 0;
  v_unmatched integer := 0;
  r record;
  v_target_product_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_source_season_id IS NULL THEN
    p_source_season_id := public.resolve_planning_source_season(p_target_season_id);
  END IF;

  IF p_source_season_id IS NULL THEN
    RETURN json_build_object('result', 'source_not_found');
  END IF;

  FOR r IN
    SELECT
      e.participant_id,
      sp.id AS source_product_id,
      public.product_planning_key(
        sp.day_of_week, sp.instructor_name, sp.start_time, sp.end_time, sp.name
      ) AS pkey
    FROM enrollments e
    JOIN products sp ON sp.id = e.product_id
    JOIN product_templates spt ON spt.id = sp.template_id
    WHERE sp.season_id = p_source_season_id
      AND e.active = TRUE
      AND spt.code = 'annual_section'
  LOOP
    SELECT tp.id INTO v_target_product_id
    FROM products tp
    JOIN product_templates tpt ON tpt.id = tp.template_id
    WHERE tp.season_id = p_target_season_id
      AND tpt.code = 'annual_section'
      AND public.product_planning_key(
        tp.day_of_week, tp.instructor_name, tp.start_time, tp.end_time, tp.name
      ) = r.pkey
    LIMIT 1;

    IF v_target_product_id IS NULL THEN
      v_unmatched := v_unmatched + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM participant_season_intents
      WHERE season_id = p_target_season_id AND participant_id = r.participant_id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_created := v_created + 1;
      CONTINUE;
    END IF;

    INSERT INTO participant_season_intents (
      season_id, participant_id, intent, source_product_id, target_product_id
    ) VALUES (
      p_target_season_id, r.participant_id, 'undecided', r.source_product_id, v_target_product_id
    );
    v_created := v_created + 1;
  END LOOP;

  RETURN json_build_object(
    'result', 'ok',
    'dry_run', p_dry_run,
    'created', v_created,
    'skipped', v_skipped,
    'unmatched', v_unmatched
  );
END;
$$;
