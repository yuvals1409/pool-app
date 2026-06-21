-- Session-based revenue recognition: allocate package payments per scheduled session.

-- ── Core: one row per billable session ───────────────────────
CREATE OR REPLACE FUNCTION public.get_session_revenue_lines(
  p_from date,
  p_to date,
  p_mode text DEFAULT 'all'
)
RETURNS TABLE (
  session_date date,
  participant_id uuid,
  participant_name text,
  enrollment_id uuid,
  session_id uuid,
  lesson_id uuid,
  domain text,
  product_label text,
  per_session_amount numeric,
  revenue_amount numeric,
  recognition text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mode_filter AS (
    SELECT CASE
      WHEN p_mode IN ('realized', 'forecast', 'all') THEN p_mode
      ELSE 'all'
    END AS mode
  ),
  group_summer AS (
    SELECT
      ss.session_date,
      sa.participant_id,
      p.full_name AS participant_name,
      sa.enrollment_id,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      'summer'::text AS domain,
      pr.name AS product_label,
      ROUND(br.amount / NULLIF(cnt.total_sessions, 0), 2) AS per_session_amount,
      CASE
        WHEN ss.session_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN participants p ON p.id = sa.participant_id
    JOIN billing_records br ON br.enrollment_id = e.id
      AND br.billing_type = 'swim_course'
      AND br.payment_status = 'paid'
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS total_sessions
      FROM session_attendees sa2
      JOIN scheduled_sessions ss2 ON ss2.id = sa2.session_id
      WHERE sa2.enrollment_id = e.id
        AND ss2.status <> 'cancelled'
    ) cnt ON cnt.total_sessions > 0
    WHERE pt.code = 'summer_course'
      AND ss.status <> 'cancelled'
      AND ss.session_date BETWEEN p_from AND p_to
  ),
  group_annual AS (
    SELECT
      ss.session_date,
      sa.participant_id,
      p.full_name AS participant_name,
      sa.enrollment_id,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      'annual'::text AS domain,
      pr.name AS product_label,
      ROUND(
        br.amount / NULLIF(
          CASE
            WHEN br.billing_month IS NOT NULL THEN cnt.month_sessions
            ELSE cnt_all.total_sessions
          END,
          0
        ),
        2
      ) AS per_session_amount,
      CASE
        WHEN ss.session_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN participants p ON p.id = sa.participant_id
    JOIN billing_records br ON br.enrollment_id = e.id
      AND br.billing_type = 'annual_monthly'
      AND br.payment_status = 'paid'
      AND (
        (br.billing_month IS NOT NULL AND br.billing_month = date_trunc('month', ss.session_date)::date)
        OR (
          br.billing_month IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM billing_records brm
            WHERE brm.enrollment_id = e.id
              AND brm.payment_status = 'paid'
              AND brm.billing_month IS NOT NULL
          )
        )
      )
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS month_sessions
      FROM session_attendees sa2
      JOIN scheduled_sessions ss2 ON ss2.id = sa2.session_id
      WHERE sa2.enrollment_id = e.id
        AND ss2.status <> 'cancelled'
        AND date_trunc('month', ss2.session_date) = date_trunc('month', ss.session_date)
    ) cnt ON TRUE
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS total_sessions
      FROM session_attendees sa3
      JOIN scheduled_sessions ss3 ON ss3.id = sa3.session_id
      WHERE sa3.enrollment_id = e.id
        AND ss3.status <> 'cancelled'
    ) cnt_all ON TRUE
    WHERE pt.code IN ('annual_section', 'adult_style_improvement')
      AND ss.status <> 'cancelled'
      AND ss.session_date BETWEEN p_from AND p_to
      AND (
        br.billing_month IS NOT NULL
        OR cnt_all.total_sessions > 0
      )
  ),
  group_summer_legacy AS (
    SELECT
      ss.session_date,
      sa.participant_id,
      p.full_name AS participant_name,
      sa.enrollment_id,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      'summer'::text AS domain,
      pr.name AS product_label,
      ROUND(COALESCE(prod.price, 0) / NULLIF(cnt.total_sessions, 0), 2) AS per_session_amount,
      CASE
        WHEN ss.session_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
    JOIN products prod ON prod.id = e.product_id
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN participants p ON p.id = sa.participant_id
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS total_sessions
      FROM session_attendees sa2
      JOIN scheduled_sessions ss2 ON ss2.id = sa2.session_id
      WHERE sa2.enrollment_id = e.id
        AND ss2.status <> 'cancelled'
    ) cnt ON cnt.total_sessions > 0
    WHERE pt.code = 'summer_course'
      AND e.payment_status = 'paid'
      AND ss.status <> 'cancelled'
      AND ss.session_date BETWEEN p_from AND p_to
      AND NOT EXISTS (
        SELECT 1 FROM billing_records br
        WHERE br.enrollment_id = e.id
          AND br.payment_status = 'paid'
      )
  ),
  group_annual_legacy AS (
    SELECT
      ss.session_date,
      sa.participant_id,
      p.full_name AS participant_name,
      sa.enrollment_id,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      'annual'::text AS domain,
      pr.name AS product_label,
      ROUND(COALESCE(prod.price, 0) / NULLIF(cnt.month_sessions, 0), 2) AS per_session_amount,
      CASE
        WHEN ss.session_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
    JOIN products prod ON prod.id = e.product_id
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN participants p ON p.id = sa.participant_id
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS month_sessions
      FROM session_attendees sa2
      JOIN scheduled_sessions ss2 ON ss2.id = sa2.session_id
      WHERE sa2.enrollment_id = e.id
        AND ss2.status <> 'cancelled'
        AND date_trunc('month', ss2.session_date) = date_trunc('month', ss.session_date)
    ) cnt ON cnt.month_sessions > 0
    WHERE pt.code IN ('annual_section', 'adult_style_improvement')
      AND e.payment_status = 'paid'
      AND ss.status <> 'cancelled'
      AND ss.session_date BETWEEN p_from AND p_to
      AND date_trunc('month', e.valid_from) = date_trunc('month', ss.session_date)
      AND NOT EXISTS (
        SELECT 1 FROM billing_records br
        WHERE br.enrollment_id = e.id
          AND br.payment_status = 'paid'
          AND br.billing_month = date_trunc('month', ss.session_date)::date
      )
  ),
  private_package AS (
    SELECT
      l.lesson_date AS session_date,
      COALESCE(pkg.participant_id, br.participant_id) AS participant_id,
      COALESCE(ptp.full_name, l.child_name) AS participant_name,
      NULL::uuid AS enrollment_id,
      NULL::uuid AS session_id,
      l.id AS lesson_id,
      'private'::text AS domain,
      CASE pkg.package_code
        WHEN 'private_5pack' THEN 'חבילת 5'
        WHEN 'private_10pack' THEN 'חבילת 10'
        ELSE pkg.package_code
      END AS product_label,
      ROUND(pkg.amount_paid / NULLIF(pkg.sessions_total, 0), 2) AS per_session_amount,
      CASE
        WHEN l.lesson_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM lessons l
    JOIN private_lesson_packages pkg ON pkg.id = l.private_package_id
    JOIN billing_records br ON br.private_package_id = pkg.id
      AND br.payment_status = 'paid'
    LEFT JOIN participants ptp ON ptp.id = pkg.participant_id
    WHERE NOT l.cancelled
      AND pkg.sessions_total > 0
      AND l.lesson_date BETWEEN p_from AND p_to
  ),
  private_single AS (
    SELECT
      l.lesson_date AS session_date,
      COALESCE(br.participant_id, (
        SELECT p2.id
        FROM participants p2
        JOIN families f ON f.id = p2.family_id
        WHERE f.phone = l.parent_phone
        ORDER BY p2.created_at
        LIMIT 1
      )) AS participant_id,
      l.child_name AS participant_name,
      NULL::uuid AS enrollment_id,
      NULL::uuid AS session_id,
      l.id AS lesson_id,
      'private'::text AS domain,
      CASE COALESCE(l.lesson_format, 'single')
        WHEN 'double' THEN 'שיעור זוגי'
        ELSE 'שיעור פרטי'
      END AS product_label,
      ROUND(COALESCE(br.amount, l.price, 0), 2) AS per_session_amount,
      CASE
        WHEN l.lesson_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM lessons l
    LEFT JOIN billing_records br ON br.lesson_id = l.id
      AND br.payment_status = 'paid'
    WHERE NOT l.cancelled
      AND l.private_package_id IS NULL
      AND l.lesson_date BETWEEN p_from AND p_to
      AND (
        br.id IS NOT NULL
        OR (l.payment_status = 'paid' AND COALESCE(l.price, 0) > 0)
      )
  ),
  combined AS (
    SELECT * FROM group_summer
    UNION ALL SELECT * FROM group_annual
    UNION ALL SELECT * FROM group_summer_legacy
    UNION ALL SELECT * FROM group_annual_legacy
    UNION ALL SELECT * FROM private_package
    UNION ALL SELECT * FROM private_single
  )
  SELECT
    c.session_date,
    c.participant_id,
    c.participant_name,
    c.enrollment_id,
    c.session_id,
    c.lesson_id,
    c.domain,
    c.product_label,
    c.per_session_amount,
    c.per_session_amount AS revenue_amount,
    c.recognition
  FROM combined c
  CROSS JOIN mode_filter mf
  WHERE c.per_session_amount > 0
    AND (
      mf.mode = 'all'
      OR (mf.mode = 'realized' AND c.recognition = 'realized')
      OR (mf.mode = 'forecast' AND c.recognition = 'forecast')
    );
$$;

-- ── Finance breakdown (session dates) ────────────────────────
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
  v_total numeric;
  v_paying integer;
  v_avg numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.domain), '[]'::json)
  INTO v_by_domain
  FROM (
    SELECT
      domain,
      COUNT(*)::int AS paid_count,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'all')
    GROUP BY domain
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month_start), '[]'::json)
  INTO v_monthly
  FROM (
    SELECT
      date_trunc('month', session_date)::date AS month_start,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'all')
    GROUP BY 1
  ) t;

  SELECT
    COUNT(DISTINCT participant_id)::int,
    COALESCE(SUM(revenue_amount), 0)::numeric(12,2)
  INTO v_paying, v_total
  FROM public.get_session_revenue_lines(p_from, p_to, 'all');

  v_avg := CASE WHEN v_paying > 0 THEN ROUND(v_total / v_paying, 2) ELSE 0 END;

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'by_domain', v_by_domain,
    'monthly', v_monthly,
    'total_revenue', v_total,
    'paying_customers', v_paying,
    'avg_revenue_per_customer', v_avg,
    'recognition_basis', 'session_date'
  );
END;
$$;

-- ── Revenue by season (session dates within season) ─────────
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
          FROM public.get_session_revenue_lines(
            s.start_date,
            (s.end_date - 1),
            'all'
          ) rl
          LEFT JOIN enrollments e ON e.id = rl.enrollment_id
          LEFT JOIN products pr ON pr.id = e.product_id
          WHERE pr.season_id = s.id
             OR (
               rl.lesson_id IS NOT NULL
               AND rl.session_date >= s.start_date
               AND rl.session_date < s.end_date
             )
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
          SELECT COALESCE(SUM(rl.revenue_amount), 0)::numeric(12,2)
          FROM public.get_session_revenue_lines(
            s.start_date,
            (s.end_date - 1),
            'all'
          ) rl
          LEFT JOIN enrollments e ON e.id = rl.enrollment_id
          LEFT JOIN products pr ON pr.id = e.product_id
          WHERE pr.season_id = s.id
             OR (
               rl.lesson_id IS NOT NULL
               AND rl.session_date >= s.start_date
               AND rl.session_date < s.end_date
             )
        ) AS gross_revenue
      FROM seasons s
      WHERE p_season_id IS NULL OR s.id = p_season_id
    ) t
  ), '[]'::json);
END;
$$;

-- ── Future revenue forecast ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_forecast(
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
  v_total numeric;
  v_sessions integer;
  v_participants integer;
  v_realized numeric;
  v_by_domain json;
  v_by_period json;
  v_by_participant json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT
    COALESCE(SUM(revenue_amount), 0),
    COUNT(*)::int,
    COUNT(DISTINCT participant_id)::int
  INTO v_total, v_sessions, v_participants
  FROM public.get_session_revenue_lines(p_from, p_to, 'forecast');

  SELECT COALESCE(SUM(revenue_amount), 0)
  INTO v_realized
  FROM public.get_session_revenue_lines(p_from, p_to, 'realized');

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.domain), '[]'::json)
  INTO v_by_domain
  FROM (
    SELECT domain, COUNT(*)::int AS session_count,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'forecast')
    GROUP BY domain
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.period_start), '[]'::json)
  INTO v_by_period
  FROM (
    SELECT date_trunc('week', session_date)::date AS period_start,
      COUNT(*)::int AS session_count,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'forecast')
    GROUP BY 1
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.revenue DESC), '[]'::json)
  INTO v_by_participant
  FROM (
    SELECT participant_id, participant_name, product_label,
      COUNT(*)::int AS session_count,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'forecast')
    GROUP BY participant_id, participant_name, product_label
    LIMIT 100
  ) t;

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'forecast_revenue', v_total,
    'forecast_sessions', v_sessions,
    'forecast_participants', v_participants,
    'realized_in_range', v_realized,
    'by_domain', v_by_domain,
    'by_period', v_by_period,
    'by_participant', v_by_participant
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_revenue_lines(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_revenue_lines(date, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_by_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_season(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_forecast(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_forecast(date, date) TO authenticated;
