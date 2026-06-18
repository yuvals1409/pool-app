-- ============================================================
--  Instructor payroll — שעות עבודה ודוח שכר
-- ============================================================

CREATE TABLE IF NOT EXISTS instructor_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_code text NOT NULL,
  rate_per_hour numeric(10,2) NOT NULL CHECK (rate_per_hour >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, template_code)
);

CREATE INDEX IF NOT EXISTS idx_instructor_pay_rates_instructor
  ON instructor_pay_rates (instructor_id);

ALTER TABLE instructor_pay_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instructor_pay_rates_select ON instructor_pay_rates;
CREATE POLICY instructor_pay_rates_select ON instructor_pay_rates
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR instructor_id = auth.uid()
  );

DROP POLICY IF EXISTS instructor_pay_rates_admin_write ON instructor_pay_rates;
CREATE POLICY instructor_pay_rates_admin_write ON instructor_pay_rates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── duration helper ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_session_duration_minutes(
  p_template_code text,
  p_start_time time,
  p_end_time time
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_mins int;
BEGIN
  IF p_template_code IN ('swim_assessment', 'private_lesson') THEN
    RETURN 30;
  END IF;

  IF p_start_time IS NOT NULL AND p_end_time IS NOT NULL THEN
    v_mins := EXTRACT(EPOCH FROM (p_end_time - p_start_time))::int / 60;
    IF v_mins > 0 THEN
      RETURN v_mins;
    END IF;
  END IF;

  RETURN 30;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_session_duration_minutes(text, time, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_session_duration_minutes(text, time, time) TO authenticated;

-- ── work sessions (attendance marked only) ───────────────────
CREATE OR REPLACE FUNCTION public.get_instructor_work_sessions(
  p_from date,
  p_to date,
  p_instructor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF public.is_admin() THEN
    v_target := p_instructor_id;
  ELSE
    v_target := v_uid;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.session_date, t.start_time, t.title), '[]'::json)
  INTO v_rows
  FROM (
  SELECT
    w.instructor_id,
    p.full_name AS instructor_name,
    w.session_type,
    w.session_id,
    w.lesson_id,
    w.scheduled_session_id,
    w.session_date,
    w.start_time,
    w.title,
    w.template_code,
    w.duration_minutes,
    ROUND(w.duration_minutes / 60.0, 2) AS duration_hours,
    w.marked_at,
    ipr.rate_per_hour AS pay_rate,
    CASE
      WHEN ipr.rate_per_hour IS NOT NULL
      THEN ROUND((w.duration_minutes / 60.0) * ipr.rate_per_hour, 2)
      ELSE NULL
    END AS pay_amount
  FROM (
    -- group sessions (non-assessment)
    SELECT
      pr.instructor_id,
      'group'::text AS session_type,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      ss.id AS scheduled_session_id,
      ss.session_date,
      ss.start_time,
      pr.name AS title,
      pt.code AS template_code,
      public.resolve_session_duration_minutes(pt.code, ss.start_time, ss.end_time) AS duration_minutes,
      MAX(sa.attendance_marked_at) AS marked_at
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN session_attendees sa ON sa.session_id = ss.id
    WHERE ss.status <> 'cancelled'
      AND pt.code <> 'swim_assessment'
      AND pr.instructor_id IS NOT NULL
      AND sa.attendance_status IN ('present', 'absent', 'excused', 'late')
      AND ss.session_date BETWEEN p_from AND p_to
    GROUP BY ss.id, pr.instructor_id, pr.name, pt.code, ss.session_date, ss.start_time, ss.end_time

    UNION ALL

    -- private lessons
    SELECT
      l.instructor_id,
      'private'::text AS session_type,
      l.id AS session_id,
      l.id AS lesson_id,
      NULL::uuid AS scheduled_session_id,
      l.lesson_date AS session_date,
      l.start_time,
      l.child_name AS title,
      'private_lesson'::text AS template_code,
      public.resolve_session_duration_minutes('private_lesson', l.start_time, l.end_time) AS duration_minutes,
      l.attendance_marked_at AS marked_at
    FROM lessons l
    WHERE NOT l.cancelled
      AND l.instructor_id IS NOT NULL
      AND l.attendance_status IN ('present', 'absent', 'excused', 'late')
      AND l.lesson_date BETWEEN p_from AND p_to

    UNION ALL

    -- swim assessments — attribute to instructor who marked attendance
    SELECT
      marker.instructor_id,
      'group'::text AS session_type,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      ss.id AS scheduled_session_id,
      ss.session_date,
      ss.start_time,
      COALESCE(pr.name, 'מבדק') AS title,
      'swim_assessment'::text AS template_code,
      public.resolve_session_duration_minutes('swim_assessment', ss.start_time, ss.end_time) AS duration_minutes,
      marker.marked_at
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN LATERAL (
      SELECT
        sa.attendance_marked_by AS instructor_id,
        MAX(sa.attendance_marked_at) AS marked_at
      FROM session_attendees sa
      WHERE sa.session_id = ss.id
        AND sa.attendance_status IN ('present', 'absent', 'excused', 'late')
        AND sa.attendance_marked_by IS NOT NULL
      GROUP BY sa.attendance_marked_by
      ORDER BY COUNT(*) DESC, MAX(sa.attendance_marked_at) DESC
      LIMIT 1
    ) marker ON true
    WHERE ss.status <> 'cancelled'
      AND pt.code = 'swim_assessment'
      AND ss.session_date BETWEEN p_from AND p_to
  ) w
  JOIN profiles p ON p.id = w.instructor_id
  LEFT JOIN instructor_pay_rates ipr
    ON ipr.instructor_id = w.instructor_id
   AND ipr.template_code = w.template_code
  WHERE v_target IS NULL OR w.instructor_id = v_target
  ) t;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_instructor_work_sessions(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_work_sessions(date, date, uuid) TO authenticated;

-- ── monthly payroll summary ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_instructor_payroll_summary(
  p_from date,
  p_to date,
  p_instructor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF public.is_admin() THEN
    v_target := p_instructor_id;
  ELSE
    v_target := v_uid;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(inst) ORDER BY inst.instructor_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      base.instructor_id,
      base.instructor_name,
      COALESCE(
        (
          SELECT json_agg(row_to_json(bt) ORDER BY bt.template_code)
          FROM (
            SELECT
              s.template_code,
              COUNT(*)::int AS session_count,
              ROUND(SUM(s.duration_minutes) / 60.0, 2) AS total_hours,
              ipr.rate_per_hour,
              CASE
                WHEN ipr.rate_per_hour IS NOT NULL
                THEN ROUND(SUM(s.duration_minutes / 60.0) * ipr.rate_per_hour, 2)
                ELSE NULL
              END AS total_pay
            FROM (
              SELECT
                (elem->>'instructor_id')::uuid AS instructor_id,
                elem->>'template_code' AS template_code,
                (elem->>'duration_minutes')::int AS duration_minutes
              FROM json_array_elements(public.get_instructor_work_sessions(p_from, p_to, v_target)) elem
            ) s
            LEFT JOIN instructor_pay_rates ipr
              ON ipr.instructor_id = s.instructor_id
             AND ipr.template_code = s.template_code
            WHERE s.instructor_id = base.instructor_id
            GROUP BY s.template_code, ipr.rate_per_hour
          ) bt
        ),
        '[]'::json
      ) AS by_template,
      ROUND(SUM(base.duration_minutes) / 60.0, 2) AS total_hours,
      (
        SELECT ROUND(SUM(sub.pay_amount), 2)
        FROM (
          SELECT (elem->>'pay_amount')::numeric AS pay_amount
          FROM json_array_elements(public.get_instructor_work_sessions(p_from, p_to, base.instructor_id)) elem
        ) sub
        WHERE sub.pay_amount IS NOT NULL
      ) AS total_pay,
      EXISTS (
        SELECT 1
        FROM json_array_elements(public.get_instructor_work_sessions(p_from, p_to, base.instructor_id)) elem
        WHERE (elem->>'pay_amount') IS NULL
      ) AS missing_rates
    FROM (
      SELECT
        (elem->>'instructor_id')::uuid AS instructor_id,
        elem->>'instructor_name' AS instructor_name,
        (elem->>'duration_minutes')::int AS duration_minutes
      FROM json_array_elements(public.get_instructor_work_sessions(p_from, p_to, v_target)) elem
    ) base
    GROUP BY base.instructor_id, base.instructor_name
  ) inst;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_instructor_payroll_summary(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_payroll_summary(date, date, uuid) TO authenticated;

-- ── pay rate management ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_instructor_pay_rates(p_instructor_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() AND auth.uid() <> p_instructor_id THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(r) ORDER BY r.template_code)
      FROM instructor_pay_rates r
      WHERE r.instructor_id = p_instructor_id
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_instructor_pay_rates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_instructor_pay_rates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_instructor_pay_rate(
  p_instructor_id uuid,
  p_template_code text,
  p_rate_per_hour numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row instructor_pay_rates%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO instructor_pay_rates (instructor_id, template_code, rate_per_hour, updated_at)
  VALUES (p_instructor_id, p_template_code, p_rate_per_hour, now())
  ON CONFLICT (instructor_id, template_code)
  DO UPDATE SET
    rate_per_hour = EXCLUDED.rate_per_hour,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_instructor_pay_rate(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_instructor_pay_rate(uuid, text, numeric) TO authenticated;
