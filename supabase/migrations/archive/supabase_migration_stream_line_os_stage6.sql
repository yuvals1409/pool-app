-- ============================================================
--  Stream Line OS — stage 6
--  מבדק multi-slot, ברקוד חמישי, analytics, sheet sync tables
-- ============================================================

-- ── 1. מבדק: מספר מועדים באותו יום ─────────────────────────
DROP INDEX IF EXISTS scheduled_sessions_product_date_idx;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_sessions_product_date_time_idx
  ON scheduled_sessions (product_id, session_date, start_time);

CREATE OR REPLACE FUNCTION public.sync_assessment_slot_session(p_slot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_product_id uuid;
  v_session_id uuid;
  v_end_time time;
BEGIN
  SELECT * INTO v_slot
  FROM assessment_slots
  WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found';
  END IF;

  IF v_slot.session_id IS NOT NULL THEN
    RETURN v_slot.session_id;
  END IF;

  v_product_id := public.ensure_assessment_product();
  v_end_time := (v_slot.start_time + interval '30 minutes')::time;

  INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
  VALUES (v_product_id, v_slot.slot_date, v_slot.start_time, v_end_time)
  ON CONFLICT (product_id, session_date, start_time) DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM scheduled_sessions
    WHERE product_id = v_product_id
      AND session_date = v_slot.slot_date
      AND start_time = v_slot.start_time;
  END IF;

  UPDATE assessment_slots
  SET session_id = v_session_id
  WHERE id = p_slot_id;

  RETURN v_session_id;
END;
$$;

-- ── 2. ברקוד שבועי — חמישי, שבוע הבא ─────────────────────
CREATE OR REPLACE FUNCTION public.get_next_week_bounds(p_reference date DEFAULT CURRENT_DATE)
RETURNS TABLE(week_start date, week_end date)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (p_reference + ((7 - EXTRACT(DOW FROM p_reference)::int) % 7))::date AS week_start,
    (p_reference + ((7 - EXTRACT(DOW FROM p_reference)::int) % 7) + 6)::date AS week_end;
$$;

CREATE OR REPLACE FUNCTION public.generate_weekly_recurring_lessons(p_target_week_start date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  week_start date;
  target_date date;
  inserted_count integer := 0;
BEGIN
  week_start := COALESCE(
    p_target_week_start,
    CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::integer
  );

  FOR r IN SELECT * FROM recurring_lessons WHERE active = true LOOP
    target_date := week_start + r.day_of_week;

    IF NOT EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.recurring_lesson_id = r.id
        AND l.lesson_date = target_date
    ) THEN
      INSERT INTO lessons (
        child_name, lesson_date, start_time, end_time,
        instructor_name, instructor_id, parent_phone,
        recurring_lesson_id
      ) VALUES (
        r.child_name, target_date, r.start_time,
        (r.start_time + interval '30 minutes')::time,
        r.instructor_name, r.instructor_id, r.parent_phone,
        r.id
      );
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_upcoming_week_passes()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_to date;
  v_sessions integer;
  v_passes integer;
  v_lessons integer;
BEGIN
  SELECT week_start, week_end INTO v_from, v_to
  FROM public.get_next_week_bounds(CURRENT_DATE);

  v_sessions := public.generate_weekly_sessions(v_from, v_to);
  v_passes := public.generate_access_passes(v_from, v_to);
  v_lessons := public.generate_weekly_recurring_lessons(v_from);

  RETURN json_build_object(
    'week_start', v_from,
    'week_end', v_to,
    'sessions_created', v_sessions,
    'passes_created', v_passes,
    'recurring_lessons_created', v_lessons
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_week_bounds(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_week_bounds(date) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_weekly_recurring_lessons(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_weekly_recurring_lessons(date) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_upcoming_week_passes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_upcoming_week_passes() TO authenticated;

DO $cron$
DECLARE
  jid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR jid IN SELECT jobid FROM cron.job
      WHERE jobname IN ('stream_line_weekly_sessions', 'generate-weekly-recurring-lessons')
    LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;

    PERFORM cron.schedule(
      'stream_line_weekly_sessions',
      '0 6 * * 4',
      $job$SELECT public.generate_upcoming_week_passes();$job$
    );
  END IF;
END;
$cron$;

-- ── 3. Sheet sync tables ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sheet_sync_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction    TEXT NOT NULL CHECK (direction IN ('pull', 'push', 'both')),
  sheet_tab    TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  rows_in      INTEGER NOT NULL DEFAULT 0,
  rows_out     INTEGER NOT NULL DEFAULT 0,
  errors       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'ok', 'partial', 'failed'))
);

CREATE TABLE IF NOT EXISTS sheet_row_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_tab    TEXT NOT NULL,
  row_key      TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  content_hash TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sheet_tab, row_key)
);

CREATE INDEX IF NOT EXISTS sheet_row_links_entity_idx
  ON sheet_row_links (entity_type, entity_id);

ALTER TABLE sheet_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_row_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read sheet sync runs"
  ON sheet_sync_runs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin manage sheet sync runs"
  ON sheet_sync_runs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin read sheet row links"
  ON sheet_row_links FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin manage sheet row links"
  ON sheet_row_links FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 4. Analytics RPCs ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_from date, p_to date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_total_sessions integer;
  v_marked integer;
  v_present integer;
  v_scan integer;
  v_instructor integer;
  v_unpaid integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*) INTO v_total_sessions
  FROM scheduled_sessions ss
  WHERE ss.session_date BETWEEN p_from AND p_to
    AND ss.status <> 'cancelled';

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE ae.status = 'present'),
    COUNT(*) FILTER (WHERE ae.source = 'guard_scan'),
    COUNT(*) FILTER (WHERE ae.source = 'instructor')
  INTO v_marked, v_present, v_scan, v_instructor
  FROM attendance_events ae
  LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
  LEFT JOIN lessons l ON l.id = ae.lesson_id
  WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to;

  SELECT COUNT(*) INTO v_unpaid
  FROM enrollments
  WHERE active = TRUE AND payment_status = 'unpaid';

  RETURN json_build_object(
    'total_sessions', v_total_sessions,
    'attendance_events', v_marked,
    'present_count', v_present,
    'attendance_rate', CASE WHEN v_marked > 0 THEN ROUND(100.0 * v_present / v_marked, 1) ELSE 0 END,
    'scan_marks', v_scan,
    'instructor_marks', v_instructor,
    'unpaid_enrollments', v_unpaid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_by_week(
  p_from date,
  p_to date,
  p_product_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.week_start), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      date_trunc('week', COALESCE(ss.session_date, l.lesson_date))::date AS week_start,
      COUNT(*) FILTER (WHERE ae.status = 'present') AS present_count,
      COUNT(*) FILTER (WHERE ae.status = 'absent') AS absent_count,
      COUNT(*) AS total_marks,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0),
        1
      ) AS attendance_rate
    FROM attendance_events ae
    LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
    LEFT JOIN lessons l ON l.id = ae.lesson_id
    LEFT JOIN products pr ON pr.id = ss.product_id
    WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to
      AND (p_product_id IS NULL OR pr.id = p_product_id)
    GROUP BY 1
  ) t;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_by_product(p_from date, p_to date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.product_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      pr.id AS product_id,
      pr.name AS product_name,
      COUNT(*) FILTER (WHERE ae.status = 'present') AS present_count,
      COUNT(*) FILTER (WHERE ae.status = 'absent') AS absent_count,
      COUNT(*) AS total_marks,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0),
        1
      ) AS attendance_rate
    FROM attendance_events ae
    JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
    JOIN products pr ON pr.id = ss.product_id
    WHERE ss.session_date BETWEEN p_from AND p_to
    GROUP BY pr.id, pr.name
  ) t;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_enrollment_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.product_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      pr.name AS product_name,
      e.payment_status,
      COUNT(*)::int AS count
    FROM enrollments e
    JOIN products pr ON pr.id = e.product_id
    WHERE e.active = TRUE
    GROUP BY pr.name, e.payment_status
  ) t;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_assessment_funnel(p_from date, p_to date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_registered integer;
  v_passed integer;
  v_failed integer;
  v_summer integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*) INTO v_registered
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to;

  SELECT COUNT(*) INTO v_passed
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.assessment_result = 'passed';

  SELECT COUNT(*) INTO v_failed
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.assessment_result = 'failed';

  SELECT COUNT(*) INTO v_summer
  FROM summer_invitations si
  JOIN assessment_leads al ON al.id = si.assessment_lead_id
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND si.used_at IS NOT NULL;

  RETURN json_build_object(
    'registered', v_registered,
    'passed', v_passed,
    'failed', v_failed,
    'summer_enrolled', v_summer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_summary(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_attendance_by_week(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_by_week(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_attendance_by_product(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_by_product(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_enrollment_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_enrollment_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.get_assessment_funnel(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assessment_funnel(date, date) TO authenticated;

-- ── 5. עדכון generate_weekly_sessions ל-conflict חדש ───────
CREATE OR REPLACE FUNCTION public.generate_weekly_sessions(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  inserted_count integer := 0;
  r record;
  sess_id uuid;
  row_count integer;
BEGIN
  d := p_from;
  WHILE d <= p_to LOOP
    FOR r IN
      SELECT
        e.id AS enrollment_id,
        e.participant_id,
        p.id AS product_id,
        p.start_time,
        p.end_time,
        p.day_of_week
      FROM enrollments e
      JOIN products p ON p.id = e.product_id
      JOIN product_templates pt ON pt.id = p.template_id
      WHERE e.active = TRUE
        AND p.day_of_week IS NOT NULL
        AND p.day_of_week = EXTRACT(DOW FROM d)::integer
        AND d >= e.valid_from
        AND d <= e.valid_until
        AND pt.schedule_pattern->>'type' = 'weekly'
    LOOP
      sess_id := NULL;
      INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
      VALUES (r.product_id, d, r.start_time, r.end_time)
      ON CONFLICT (product_id, session_date, start_time) DO NOTHING
      RETURNING id INTO sess_id;

      IF sess_id IS NULL THEN
        SELECT id INTO sess_id
        FROM scheduled_sessions
        WHERE product_id = r.product_id
          AND session_date = d
          AND start_time = r.start_time;
      END IF;

      INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
      VALUES (sess_id, r.enrollment_id, r.participant_id)
      ON CONFLICT (session_id, enrollment_id) DO NOTHING;

      GET DIAGNOSTICS row_count = ROW_COUNT;
      IF row_count > 0 THEN
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
    d := d + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

SELECT 'Stream Line OS stage 6 migration complete' AS status;
