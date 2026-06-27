-- Attendance roster: makeup attendee metadata + session list makeup count

CREATE OR REPLACE FUNCTION public.get_session_attendance_roster(p_session_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.can_mark_session_attendance(p_session_id) THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.is_makeup DESC, t.child_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      sa.id AS attendee_id,
      sa.enrollment_id,
      sa.participant_id,
      p.full_name AS child_name,
      sa.attendance_status,
      sa.attendance_source,
      sa.attendee_type,
      sa.attendee_type = 'makeup' AS is_makeup,
      home_pr.name AS home_product_name
    FROM session_attendees sa
    JOIN participants p ON p.id = sa.participant_id
    JOIN enrollments e ON e.id = sa.enrollment_id
    JOIN products home_pr ON home_pr.id = e.product_id
    WHERE sa.session_id = p_session_id
  ) t;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_instructor_sessions(p_date date DEFAULT CURRENT_DATE)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.start_time, t.title), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      'group'::text AS session_type,
      ss.id AS session_id,
      ss.id AS scheduled_session_id,
      NULL::uuid AS lesson_id,
      pr.name AS title,
      pt.code AS template_code,
      ss.session_date,
      ss.start_time,
      ss.end_time,
      COUNT(sa.id)::int AS expected_count,
      COUNT(sa.id) FILTER (
        WHERE sa.attendance_status IN ('present', 'absent', 'excused', 'late')
      )::int AS marked_count,
      COUNT(sa.id) FILTER (WHERE sa.attendee_type = 'makeup')::int AS makeup_count
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
    LEFT JOIN session_attendees sa ON sa.session_id = ss.id
    WHERE ss.session_date = p_date
      AND ss.status <> 'cancelled'
      AND (
        public.is_admin()
        OR (pt.code = 'swim_assessment' AND p_date = CURRENT_DATE)
        OR eff.instructor_id = v_uid
      )
    GROUP BY ss.id, pr.name, pt.code, ss.session_date, ss.start_time, ss.end_time

    UNION ALL

    SELECT
      'private'::text AS session_type,
      l.id AS session_id,
      NULL::uuid AS scheduled_session_id,
      l.id AS lesson_id,
      l.child_name AS title,
      'private_lesson'::text AS template_code,
      l.lesson_date AS session_date,
      l.start_time,
      l.end_time,
      1 AS expected_count,
      CASE WHEN l.attendance_status IN ('present', 'absent', 'excused', 'late') THEN 1 ELSE 0 END AS marked_count,
      0 AS makeup_count
    FROM lessons l
    WHERE l.lesson_date = p_date
      AND NOT l.cancelled
      AND (public.is_admin() OR l.instructor_id = v_uid)
  ) t;

  RETURN v_rows;
END;
$$;
