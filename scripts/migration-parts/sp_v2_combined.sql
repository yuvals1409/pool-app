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
-- ── Annual planning summary ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_annual_planning_summary(
  p_target_season_id uuid,
  p_source_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id uuid;
  v_target record;
  v_source record;
  v_active_current integer := 0;
  v_confirmed integer := 0;
  v_refused integer := 0;
  v_undecided integer := 0;
  v_no_intent integer := 0;
  v_renewal_pct numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  r record;
  v_intent record;
  v_status text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_target FROM seasons WHERE id = p_target_season_id;
  IF v_target IS NULL THEN
    RETURN json_build_object('result', 'target_not_found');
  END IF;

  v_source_id := COALESCE(p_source_season_id, public.resolve_planning_source_season(p_target_season_id));
  IF v_source_id IS NOT NULL THEN
    SELECT * INTO v_source FROM seasons WHERE id = v_source_id;
  END IF;

  IF v_source.id IS NOT NULL THEN
    SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_active_current
    FROM enrollments e
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    WHERE pr.season_id = v_source.id AND e.active = TRUE AND pt.code = 'annual_section';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE intent = 'confirmed')::integer,
    COUNT(*) FILTER (WHERE intent = 'refused')::integer,
    COUNT(*) FILTER (WHERE intent = 'undecided')::integer
  INTO v_confirmed, v_refused, v_undecided
  FROM participant_season_intents
  WHERE season_id = p_target_season_id;

  IF v_source.id IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT ON (p.id)
        p.id AS participant_id,
        p.full_name AS participant_name,
        sp.id AS source_product_id,
        sp.name AS current_product_name,
        sp.instructor_name AS current_instructor,
        sp.day_of_week AS current_day,
        sp.start_time AS current_start
      FROM participants p
      JOIN enrollments e ON e.participant_id = p.id AND e.active = TRUE
      JOIN products sp ON sp.id = e.product_id
      JOIN product_templates spt ON spt.id = sp.template_id
      WHERE sp.season_id = v_source.id AND spt.code = 'annual_section'
      ORDER BY p.id, sp.day_of_week, sp.start_time
    LOOP
      SELECT * INTO v_intent
      FROM participant_season_intents
      WHERE season_id = p_target_season_id AND participant_id = r.participant_id;

      IF v_intent.id IS NULL THEN
        v_status := 'no_intent';
        v_no_intent := v_no_intent + 1;
      ELSE
        v_status := v_intent.intent;
      END IF;

      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'participant_id', r.participant_id,
        'participant_name', r.participant_name,
        'status', v_status,
        'intent', COALESCE(v_intent.intent, 'no_intent'),
        'current_product_name', r.current_product_name,
        'current_instructor', r.current_instructor,
        'current_day', r.current_day,
        'current_start', r.current_start,
        'source_product_id', r.source_product_id,
        'target_product_id', v_intent.target_product_id,
        'planned_product_name', (SELECT name FROM products WHERE id = v_intent.target_product_id),
        'enrollment_id', v_intent.enrollment_id
      ));
    END LOOP;
  END IF;

  IF v_active_current > 0 THEN
    v_renewal_pct := ROUND(100.0 * v_confirmed / v_active_current, 1);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'target_season', json_build_object(
      'id', v_target.id, 'name', v_target.name,
      'start_date', v_target.start_date, 'end_date', v_target.end_date,
      'active', v_target.active, 'kind', v_target.kind,
      'summer_planning_enabled', v_target.summer_planning_enabled
    ),
    'source_season', CASE WHEN v_source.id IS NULL THEN NULL ELSE json_build_object(
      'id', v_source.id, 'name', v_source.name
    ) END,
    'active_current', v_active_current,
    'confirmed', v_confirmed,
    'refused', v_refused,
    'undecided', v_undecided,
    'no_intent', v_no_intent,
    'renewal_pct', v_renewal_pct,
    'rows', v_rows
  );
END;
$$;

-- ── Summer planning summary ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_summer_planning_summary(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season record;
  v_courses integer := 0;
  v_enrolled integer := 0;
  v_slots integer := 0;
  v_empty_slots integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_season FROM seasons WHERE id = p_season_id;
  IF v_season IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  SELECT COUNT(*)::integer INTO v_courses
  FROM products p
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.season_id = p_season_id AND pt.code = 'summer_course';

  SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_enrolled
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.season_id = p_season_id AND e.active = TRUE AND pt.code = 'summer_course';

  SELECT COUNT(*)::integer, COUNT(*) FILTER (WHERE product_id IS NULL)::integer
  INTO v_slots, v_empty_slots
  FROM season_schedule_slots
  WHERE season_id = p_season_id AND layer = 'summer';

  RETURN json_build_object(
    'result', 'ok',
    'season', json_build_object(
      'id', v_season.id, 'name', v_season.name,
      'summer_planning_enabled', v_season.summer_planning_enabled
    ),
    'courses', v_courses,
    'enrolled', v_enrolled,
    'summer_slots', v_slots,
    'empty_summer_slots', v_empty_slots
  );
END;
$$;

-- ── Master schedule fetch ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_season_master_schedule(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_approved_staff() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'layer', s.layer,
        'day_of_week', s.day_of_week,
        'start_time', s.start_time,
        'end_time', s.end_time,
        'product_id', s.product_id,
        'label', s.label,
        'product_name', p.name,
        'instructor_name', p.instructor_name,
        'template_code', pt.code
      ) ORDER BY s.layer, s.day_of_week, s.start_time)
      FROM season_schedule_slots s
      LEFT JOIN products p ON p.id = s.product_id
      LEFT JOIN product_templates pt ON pt.id = p.template_id
      WHERE s.season_id = p_season_id
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Upsert schedule slot ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_schedule_slot(
  p_season_id uuid,
  p_layer text,
  p_day_of_week integer,
  p_start_time time,
  p_end_time time,
  p_label text DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_layer NOT IN ('annual', 'summer') THEN
    RETURN json_build_object('result', 'invalid_layer');
  END IF;

  IF p_slot_id IS NOT NULL THEN
    UPDATE season_schedule_slots SET
      day_of_week = p_day_of_week,
      start_time = p_start_time,
      end_time = p_end_time,
      label = p_label
    WHERE id = p_slot_id AND season_id = p_season_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO season_schedule_slots (
      season_id, layer, day_of_week, start_time, end_time, label
    ) VALUES (
      p_season_id, p_layer, p_day_of_week, p_start_time, p_end_time, p_label
    )
    ON CONFLICT (season_id, layer, day_of_week, start_time) DO UPDATE
      SET end_time = EXCLUDED.end_time, label = EXCLUDED.label
    RETURNING id INTO v_id;
  END IF;

  RETURN json_build_object('result', 'ok', 'slot_id', v_id);
END;
$$;

-- ── Assign product to slot ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_slot_product(
  p_slot_id uuid,
  p_product_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_code text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT s.*, pt.code AS template_code
  INTO v_slot
  FROM season_schedule_slots s
  LEFT JOIN products p ON p.id = p_product_id
  LEFT JOIN product_templates pt ON pt.id = p.template_id
  WHERE s.id = p_slot_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'slot_not_found');
  END IF;

  IF p_product_id IS NOT NULL THEN
    v_code := v_slot.template_code;
    IF v_slot.layer = 'annual' AND v_code <> 'annual_section' THEN
      RETURN json_build_object('result', 'invalid_product_layer');
    END IF;
    IF v_slot.layer = 'summer' AND v_code <> 'summer_course' THEN
      RETURN json_build_object('result', 'invalid_product_layer');
    END IF;
  END IF;

  UPDATE season_schedule_slots
  SET product_id = p_product_id
  WHERE id = p_slot_id;

  PERFORM public.sync_product_from_schedule_slot(p_slot_id);

  RETURN json_build_object('result', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_schedule_slot(p_slot_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;
  DELETE FROM season_schedule_slots WHERE id = p_slot_id;
  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── Enable summer planning phase ─────────────────────────────
CREATE OR REPLACE FUNCTION public.enable_summer_planning(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  UPDATE seasons SET summer_planning_enabled = TRUE WHERE id = p_season_id;

  RETURN json_build_object('result', 'ok', 'season_id', p_season_id);
END;
$$;

-- ── Backfill: slots from annual products ─────────────────────
INSERT INTO season_schedule_slots (season_id, layer, day_of_week, start_time, end_time, product_id, label)
SELECT
  p.season_id, 'annual', p.day_of_week, p.start_time, p.end_time, p.id, p.name
FROM products p
JOIN product_templates pt ON pt.id = p.template_id
WHERE pt.code = 'annual_section'
  AND p.day_of_week IS NOT NULL
ON CONFLICT (season_id, layer, day_of_week, start_time) DO NOTHING;

-- ── Backfill: intents from existing planning enrollments ─────
INSERT INTO participant_season_intents (
  season_id, participant_id, intent, target_product_id, enrollment_id
)
SELECT DISTINCT ON (p.season_id, e.participant_id)
  p.season_id, e.participant_id, 'confirmed', e.product_id, e.id
FROM enrollments e
JOIN products p ON p.id = e.product_id
JOIN product_templates pt ON pt.id = p.template_id
JOIN seasons s ON s.id = p.season_id
WHERE e.active = TRUE
  AND pt.code = 'annual_section'
  AND s.active = FALSE
  AND s.start_date > CURRENT_DATE
ON CONFLICT (season_id, participant_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.sync_product_from_schedule_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_product_from_schedule_slot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_source_annual_products(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_source_annual_products(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_participant_intent_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_participant_intent_enrollment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_participant_intent(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_participant_intent(uuid, uuid, text, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.carry_forward_intents(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_forward_intents(uuid, uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_annual_planning_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_annual_planning_summary(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_summer_planning_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_summer_planning_summary(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_season_master_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_master_schedule(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_schedule_slot(uuid, text, integer, time, time, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_schedule_slot(uuid, text, integer, time, time, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_slot_product(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_slot_product(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_schedule_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_schedule_slot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.enable_summer_planning(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enable_summer_planning(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.clone_season_products(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_season_products(uuid, uuid, uuid[]) TO authenticated;

-- ── Backfill: slots from annual products ─────────────────────
INSERT INTO season_schedule_slots (season_id, layer, day_of_week, start_time, end_time, product_id, label)
SELECT
  p.season_id, 'annual', p.day_of_week, p.start_time, p.end_time, p.id, p.name
FROM products p
JOIN product_templates pt ON pt.id = p.template_id
WHERE pt.code = 'annual_section'
  AND p.day_of_week IS NOT NULL
ON CONFLICT (season_id, layer, day_of_week, start_time) DO NOTHING;

-- ── Backfill: intents from existing planning enrollments ─────
INSERT INTO participant_season_intents (
  season_id, participant_id, intent, target_product_id, enrollment_id
)
SELECT DISTINCT ON (p.season_id, e.participant_id)
  p.season_id, e.participant_id, 'confirmed', e.product_id, e.id
FROM enrollments e
JOIN products p ON p.id = e.product_id
JOIN product_templates pt ON pt.id = p.template_id
JOIN seasons s ON s.id = p.season_id
WHERE e.active = TRUE
  AND pt.code = 'annual_section'
  AND s.active = FALSE
  AND s.start_date > CURRENT_DATE
ON CONFLICT (season_id, participant_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.sync_product_from_schedule_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_product_from_schedule_slot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_source_annual_products(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_source_annual_products(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_participant_intent_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_participant_intent_enrollment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_participant_intent(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_participant_intent(uuid, uuid, text, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.carry_forward_intents(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_forward_intents(uuid, uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_annual_planning_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_annual_planning_summary(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_summer_planning_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_summer_planning_summary(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_season_master_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_master_schedule(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_schedule_slot(uuid, text, integer, time, time, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_schedule_slot(uuid, text, integer, time, time, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_slot_product(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_slot_product(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_schedule_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_schedule_slot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.enable_summer_planning(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enable_summer_planning(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.clone_season_products(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_season_products(uuid, uuid, uuid[]) TO authenticated;

SELECT 'Season planning v2 migration complete' AS status;
