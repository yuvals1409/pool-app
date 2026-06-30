-- Fix get_revenue_by_season: avoid JOIN fan-out inflating SUM(br.amount).

CREATE OR REPLACE FUNCTION public.get_revenue_by_season(p_season_id uuid DEFAULT NULL)
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
    SELECT json_agg(row_to_json(t) ORDER BY t.season_name)
    FROM (
      SELECT
        s.id AS season_id,
        s.name AS season_name,
        (
          SELECT COUNT(*)::int
          FROM billing_records br
          WHERE br.season_id = s.id AND br.payment_status = 'paid'
        ) AS paid_count,
        (
          SELECT COUNT(*)::int
          FROM enrollments e
          JOIN products p ON p.id = e.product_id
          WHERE p.season_id = s.id AND e.payment_status = 'unpaid' AND e.active
        ) AS unpaid_count,
        (
          SELECT COUNT(*)::int
          FROM enrollments e
          JOIN products p ON p.id = e.product_id
          WHERE p.season_id = s.id AND e.payment_status = 'waived' AND e.active
        ) AS waived_count,
        (
          COALESCE((
            SELECT SUM(br.amount)
            FROM billing_records br
            WHERE br.season_id = s.id AND br.payment_status = 'paid'
          ), 0)
          + COALESCE((
            SELECT SUM(COALESCE(p2.price, 0))
            FROM enrollments e2
            JOIN products p2 ON p2.id = e2.product_id
            WHERE e2.payment_status = 'paid'
              AND e2.active
              AND p2.season_id = s.id
              AND NOT EXISTS (
                SELECT 1 FROM billing_records br2 WHERE br2.enrollment_id = e2.id
              )
          ), 0)
        )::numeric(12,2) AS gross_revenue
      FROM seasons s
      WHERE p_season_id IS NULL OR s.id = p_season_id
    ) t
  ), '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.get_revenue_by_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_season(uuid) TO authenticated;
