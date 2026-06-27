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

