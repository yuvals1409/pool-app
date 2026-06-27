-- ── 3. get_revenue_breakdown ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_breakdown(
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_domain json;
  v_monthly json;
  v_avg numeric;
  v_paying integer;
  v_total numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.domain), '[]'::json)
  INTO v_by_domain
  FROM (
    SELECT
      CASE
        WHEN pt.code IN ('annual_section') THEN 'annual'
        WHEN pt.code IN ('summer_course') THEN 'summer'
        WHEN pt.code = 'swim_assessment' THEN 'assessment'
        ELSE pt.code
      END AS domain,
      COUNT(*) FILTER (WHERE e.payment_status = 'paid')::int AS paid_count,
      COALESCE(SUM(CASE WHEN e.payment_status = 'paid' THEN COALESCE(p.price, 0) ELSE 0 END), 0)::numeric(12,2) AS revenue
    FROM enrollments e
    JOIN products p ON p.id = e.product_id
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE e.active = TRUE
      AND e.valid_from BETWEEN p_from AND p_to
    GROUP BY 1
    UNION ALL
    SELECT
      'private' AS domain,
      COUNT(*) FILTER (WHERE l.payment_status = 'paid')::int,
      COALESCE(SUM(CASE WHEN l.payment_status = 'paid' THEN COALESCE(l.price, 0) ELSE 0 END), 0)::numeric(12,2)
    FROM lessons l
    WHERE NOT l.cancelled
      AND l.lesson_date BETWEEN p_from AND p_to
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month_start), '[]'::json)
  INTO v_monthly
  FROM (
    SELECT
      date_trunc('month', sub.dt)::date AS month_start,
      COALESCE(SUM(sub.amount), 0)::numeric(12,2) AS revenue
    FROM (
      SELECT e.valid_from AS dt,
        CASE WHEN e.payment_status = 'paid' THEN COALESCE(p.price, 0) ELSE 0 END AS amount
      FROM enrollments e
      JOIN products p ON p.id = e.product_id
      WHERE e.active = TRUE AND e.valid_from BETWEEN p_from AND p_to
      UNION ALL
      SELECT l.lesson_date,
        CASE WHEN l.payment_status = 'paid' THEN COALESCE(l.price, 0) ELSE 0 END
      FROM lessons l
      WHERE NOT l.cancelled AND l.lesson_date BETWEEN p_from AND p_to
    ) sub
    WHERE sub.amount > 0
    GROUP BY 1
  ) t;

  SELECT
    COUNT(DISTINCT payer_id)::int,
    COALESCE(SUM(rev), 0)::numeric(12,2)
  INTO v_paying, v_total
  FROM (
    SELECT e.participant_id AS payer_id,
      CASE WHEN e.payment_status = 'paid' THEN COALESCE(p.price, 0) ELSE 0 END AS rev
    FROM enrollments e
    JOIN products p ON p.id = e.product_id
    WHERE e.active = TRUE AND e.valid_from BETWEEN p_from AND p_to
      AND e.payment_status = 'paid'
    UNION ALL
    SELECT NULL::uuid,
      CASE WHEN l.payment_status = 'paid' THEN COALESCE(l.price, 0) ELSE 0 END
    FROM lessons l
    WHERE NOT l.cancelled AND l.lesson_date BETWEEN p_from AND p_to
      AND l.payment_status = 'paid'
  ) payers;

  v_avg := CASE WHEN v_paying > 0 THEN ROUND(v_total / v_paying, 2) ELSE 0 END;

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'by_domain', v_by_domain,
    'monthly', v_monthly,
    'total_revenue', v_total,
    'paying_customers', v_paying,
    'avg_per_customer', v_avg
  );
END;
$$;

