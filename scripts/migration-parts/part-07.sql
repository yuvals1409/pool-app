-- ── 7. get_operations_daily ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_operations_daily(
  p_date date DEFAULT CURRENT_DATE
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
    SELECT json_agg(row_to_json(t) ORDER BY t.start_time)
    FROM (
      SELECT
        ss.id AS session_id,
        pr.id AS product_id,
        pr.name AS product_name,
        pr.instructor_name,
        ss.start_time,
        ss.end_time,
        ss.status,
        COUNT(DISTINCT sa.enrollment_id)::int AS enrolled,
        pr.capacity,
        CASE
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id) >= pr.capacity THEN 'full'
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id)::numeric / pr.capacity >= 0.8 THEN 'high'
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id)::numeric / NULLIF(pr.capacity, 0) < 0.5 THEN 'low'
          ELSE 'normal'
        END AS fill_status
      FROM scheduled_sessions ss
      JOIN products pr ON pr.id = ss.product_id
      LEFT JOIN session_attendees sa ON sa.session_id = ss.id
      LEFT JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
      WHERE ss.session_date = p_date
        AND ss.status <> 'cancelled'
      GROUP BY ss.id, pr.id, pr.name, pr.instructor_name, ss.start_time, ss.end_time, ss.status, pr.capacity
    ) t
  ), '[]'::json);
END;
$$;

