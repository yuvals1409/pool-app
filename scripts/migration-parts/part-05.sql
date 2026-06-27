-- ── 5. get_attendance_summary ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_attendance_summary(
  p_from date,
  p_to date,
  p_group_by text DEFAULT 'product'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF p_group_by = 'participant' THEN
    RETURN COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.label)
      FROM (
        SELECT
          part.id AS entity_id,
          part.full_name AS label,
          COUNT(*) FILTER (WHERE ae.status = 'present')::int AS present_count,
          COUNT(*) FILTER (WHERE ae.status = 'absent')::int AS absent_count,
          COUNT(*)::int AS total_marks,
          ROUND(100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0), 1) AS attendance_rate
        FROM attendance_events ae
        JOIN participants part ON part.id = ae.participant_id
        LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        LEFT JOIN lessons l ON l.id = ae.lesson_id
        WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to
        GROUP BY part.id, part.full_name
      ) t
    ), '[]'::json);
  ELSIF p_group_by = 'instructor' THEN
    RETURN COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.label)
      FROM (
        SELECT
          COALESCE(pr.instructor_id::text, pr.instructor_name) AS entity_id,
          COALESCE(pr.instructor_name, '—') AS label,
          COUNT(*) FILTER (WHERE ae.status = 'present')::int AS present_count,
          COUNT(*) FILTER (WHERE ae.status = 'absent')::int AS absent_count,
          COUNT(*)::int AS total_marks,
          ROUND(100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0), 1) AS attendance_rate
        FROM attendance_events ae
        JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        JOIN products pr ON pr.id = ss.product_id
        WHERE ss.session_date BETWEEN p_from AND p_to
        GROUP BY COALESCE(pr.instructor_id::text, pr.instructor_name), pr.instructor_name
      ) t
    ), '[]'::json);
  ELSE
    RETURN COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.label)
      FROM (
        SELECT
          pr.id AS entity_id,
          pr.name AS label,
          COUNT(*) FILTER (WHERE ae.status = 'present')::int AS present_count,
          COUNT(*) FILTER (WHERE ae.status = 'absent')::int AS absent_count,
          COUNT(*)::int AS total_marks,
          ROUND(100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0), 1) AS attendance_rate
        FROM attendance_events ae
        JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        JOIN products pr ON pr.id = ss.product_id
        WHERE ss.session_date BETWEEN p_from AND p_to
        GROUP BY pr.id, pr.name
      ) t
    ), '[]'::json);
  END IF;
END;
$$;

