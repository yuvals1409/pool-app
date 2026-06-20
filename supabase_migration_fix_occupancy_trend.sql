-- Fix get_occupancy_trend: week_start + integer fails on timestamptz from generate_series

CREATE OR REPLACE FUNCTION public.get_occupancy_trend(
  p_from date,
  p_to date,
  p_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid := p_season_id;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.week_start)
    FROM (
      SELECT
        w.week_start::date AS week_start,
        COUNT(e.id)::int AS enrolled,
        COALESCE(SUM(p.capacity), 0)::int AS capacity,
        ROUND(100.0 * COUNT(e.id) / NULLIF(SUM(p.capacity), 0), 1) AS occupancy_pct
      FROM generate_series(
        date_trunc('week', p_from)::date,
        date_trunc('week', p_to)::date,
        '7 days'::interval
      ) AS w(week_start)
      CROSS JOIN products p
      LEFT JOIN enrollments e ON e.product_id = p.id
        AND e.active = TRUE
        AND e.valid_from <= (w.week_start::date + 6)
        AND e.valid_until >= w.week_start::date
      WHERE p.capacity IS NOT NULL
        AND (v_season_id IS NULL OR p.season_id = v_season_id)
      GROUP BY w.week_start::date
    ) t
  ), '[]'::json);
END;
$$;

SELECT 'get_occupancy_trend fix applied' AS status;
