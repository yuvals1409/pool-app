-- ── 4. get_instructor_analytics ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_instructor_analytics(
  p_from date,
  p_to date,
  p_instructor_id uuid DEFAULT NULL
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

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.instructor_name)
    FROM (
      SELECT
        COALESCE(pr.instructor_id, pf.id) AS instructor_id,
        COALESCE(pr.instructor_name, pf.full_name, '—') AS instructor_name,
        pf.hired_at,
        COUNT(DISTINCT e.participant_id)::int AS student_count,
        COUNT(DISTINCT pr.id)::int AS group_count,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (pr.end_time - pr.start_time)) / 3600.0
        ), 0)::numeric(10,1) AS weekly_hours,
        ROUND(
          100.0 * COUNT(e.id) FILTER (WHERE pr.capacity IS NOT NULL)
            / NULLIF(SUM(pr.capacity), 0),
          1
        ) AS occupancy_pct,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE ae.status = 'present')
            / NULLIF(COUNT(ae.id), 0),
          1
        ) AS attendance_pct,
        COALESCE(SUM(
          CASE WHEN e.payment_status = 'paid' THEN COALESCE(pr.price, 0) ELSE 0 END
        ), 0)::numeric(12,2) AS revenue_to_school
      FROM products pr
      LEFT JOIN profiles pf ON pf.id = pr.instructor_id
      JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
      LEFT JOIN scheduled_sessions ss ON ss.product_id = pr.id
        AND ss.session_date BETWEEN p_from AND p_to
        AND ss.status <> 'cancelled'
      LEFT JOIN attendance_events ae ON ae.scheduled_session_id = ss.id
        AND ae.enrollment_id = e.id
      WHERE (p_instructor_id IS NULL OR pr.instructor_id = p_instructor_id
        OR (p_instructor_id IS NOT NULL AND pf.id = p_instructor_id))
      GROUP BY COALESCE(pr.instructor_id, pf.id), COALESCE(pr.instructor_name, pf.full_name, '—'), pf.hired_at
    ) t
  ), '[]'::json);
END;
$$;

