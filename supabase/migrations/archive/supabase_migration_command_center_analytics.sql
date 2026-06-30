-- ============================================================
--  Command Center — Analytics RPCs (שלב 2)
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- ── Helper: active student IDs (enrolled + present) ───────────
CREATE OR REPLACE FUNCTION public.cc_active_student_ids(
  p_as_of date DEFAULT CURRENT_DATE,
  p_season_id uuid DEFAULT NULL
)
RETURNS TABLE(participant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT e.participant_id
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  JOIN attendance_events ae ON ae.enrollment_id = e.id AND ae.status = 'present'
  WHERE e.active = TRUE
    AND e.valid_from <= p_as_of
    AND e.valid_until >= p_as_of
    AND (p_season_id IS NULL OR p.season_id = p_season_id);
$$;

-- ── 1. get_school_overview_kpis ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_school_overview_kpis(
  p_as_of date DEFAULT CURRENT_DATE,
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
  v_active_students integer;
  v_active_groups integer;
  v_active_instructors integer;
  v_enrolled integer;
  v_capacity integer;
  v_occupancy numeric;
  v_new_month integer;
  v_churned_month integer;
  v_private_lessons integer;
  v_month_start date;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1;
  END IF;

  v_month_start := date_trunc('month', p_as_of)::date;

  SELECT COUNT(*)::int INTO v_active_students
  FROM public.cc_active_student_ids(p_as_of, v_season_id);

  SELECT COUNT(DISTINCT p.id)::int INTO v_active_groups
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  SELECT COUNT(DISTINCT COALESCE(p.instructor_id::text, p.instructor_name))::int
  INTO v_active_instructors
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  SELECT
    COUNT(*)::int,
    COALESCE(SUM(p.capacity), 0)::int
  INTO v_enrolled, v_capacity
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE p.capacity IS NOT NULL
    AND (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  v_occupancy := CASE WHEN v_capacity > 0
    THEN ROUND(100.0 * v_enrolled / v_capacity, 1) ELSE 0 END;

  SELECT COUNT(DISTINCT e.participant_id)::int INTO v_new_month
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  WHERE e.valid_from >= v_month_start
    AND e.valid_from <= p_as_of
    AND (v_season_id IS NULL OR p.season_id = v_season_id);

  SELECT COUNT(*)::int INTO v_churned_month
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  WHERE e.active = FALSE
    AND e.cancelled_at IS NOT NULL
    AND e.cancelled_at::date >= v_month_start
    AND e.cancelled_at::date <= p_as_of
    AND (v_season_id IS NULL OR p.season_id = v_season_id);

  SELECT COUNT(*)::int INTO v_private_lessons
  FROM lessons
  WHERE NOT cancelled
    AND lesson_date >= p_as_of;

  RETURN json_build_object(
    'as_of', p_as_of,
    'season_id', v_season_id,
    'active_students', v_active_students,
    'active_groups', v_active_groups,
    'active_instructors', v_active_instructors,
    'occupancy_pct', v_occupancy,
    'enrolled_seats', v_enrolled,
    'total_capacity', v_capacity,
    'new_this_month', v_new_month,
    'churned_this_month', v_churned_month,
    'active_private_lessons', v_private_lessons
  );
END;
$$;

-- ── 2. get_student_demographics ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_student_demographics(
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
    RETURN '{}'::json;
  END IF;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1;
  END IF;

  RETURN json_build_object(
    'season_id', v_season_id,
    'by_grade', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.cnt DESC)
      FROM (
        SELECT COALESCE(p.grade, 'לא ידוע') AS grade, COUNT(DISTINCT p.id)::int AS cnt
        FROM participants p
        WHERE EXISTS (
          SELECT 1 FROM enrollments e
          JOIN products pr ON pr.id = e.product_id
          WHERE e.participant_id = p.id AND e.active = TRUE
            AND (v_season_id IS NULL OR pr.season_id = v_season_id)
        )
        GROUP BY 1
      ) t
    ), '[]'::json),
    'by_gender', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.cnt DESC)
      FROM (
        SELECT COALESCE(p.gender, 'unknown') AS gender, COUNT(DISTINCT p.id)::int AS cnt
        FROM participants p
        WHERE EXISTS (
          SELECT 1 FROM enrollments e
          JOIN products pr ON pr.id = e.product_id
          WHERE e.participant_id = p.id AND e.active = TRUE
            AND (v_season_id IS NULL OR pr.season_id = v_season_id)
        )
        GROUP BY 1
      ) t
    ), '[]'::json),
    'by_tenure', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.sort_order)
      FROM (
        SELECT bucket, sort_order, COUNT(*)::int AS cnt
        FROM (
          SELECT p.id,
            CASE
              WHEN p.first_enrolled_at IS NULL THEN 'unknown'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '3 months' THEN '0-3m'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '12 months' THEN '3-12m'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '24 months' THEN '1-2y'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '36 months' THEN '2-3y'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '60 months' THEN '3-5y'
              ELSE '5y+'
            END AS bucket,
            CASE
              WHEN p.first_enrolled_at IS NULL THEN 0
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '3 months' THEN 1
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '12 months' THEN 2
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '24 months' THEN 3
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '36 months' THEN 4
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '60 months' THEN 5
              ELSE 6
            END AS sort_order
          FROM participants p
          WHERE EXISTS (
            SELECT 1 FROM enrollments e
            JOIN products pr ON pr.id = e.product_id
            WHERE e.participant_id = p.id AND e.active = TRUE
              AND (v_season_id IS NULL OR pr.season_id = v_season_id)
          )
        ) sub
        GROUP BY bucket, sort_order
      ) t
    ), '[]'::json)
  );
END;
$$;

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

-- ── 6. get_marketing_funnel ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_marketing_funnel(
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
  v_leads integer;
  v_assessed integer;
  v_passed integer;
  v_enrolled integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*)::int INTO v_leads
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.status IN ('new', 'call', 'registered_assessment');

  SELECT COUNT(*)::int INTO v_assessed
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.status = 'registered_assessment';

  SELECT COUNT(*)::int INTO v_passed
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.assessment_result = 'passed';

  SELECT COUNT(DISTINCT al.participant_id)::int INTO v_enrolled
  FROM assessment_leads al
  JOIN enrollments e ON e.participant_id = al.participant_id AND e.active = TRUE
  JOIN products p ON p.id = e.product_id
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND pt.code = 'annual_section';

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'leads', v_leads,
    'assessed', v_assessed,
    'passed', v_passed,
    'enrolled_annual', v_enrolled,
    'conversion_assessed', CASE WHEN v_leads > 0 THEN ROUND(100.0 * v_assessed / v_leads, 1) ELSE 0 END,
    'conversion_enrolled', CASE WHEN v_assessed > 0 THEN ROUND(100.0 * v_enrolled / v_assessed, 1) ELSE 0 END,
    'by_source', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.cnt DESC)
      FROM (
        SELECT al.source, COUNT(*)::int AS cnt
        FROM assessment_leads al
        WHERE al.created_at::date BETWEEN p_from AND p_to
        GROUP BY al.source
      ) t
    ), '[]'::json)
  );
END;
$$;

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

-- ── 8. get_school_health_score ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_school_health_score(
  p_month date DEFAULT date_trunc('month', CURRENT_DATE)::date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_month_end date;
  v_occupancy numeric;
  v_new_count integer;
  v_churn_count integer;
  v_growth_ratio numeric;
  v_occupancy_score numeric;
  v_growth_score numeric;
  v_total numeric;
  v_color text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT * INTO v_settings FROM school_health_settings ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    v_settings := ROW(
      gen_random_uuid(), 60::numeric, 40::numeric, 80::numeric, 60::numeric, NOW(), NULL::uuid
    );
  END IF;

  v_month_end := (v_month + INTERVAL '1 month' - INTERVAL '1 day')::date;

  SELECT COALESCE(
    ROUND(100.0 * COUNT(e.id) / NULLIF(SUM(p.capacity), 0), 1),
    0
  ) INTO v_occupancy
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE p.capacity IS NOT NULL
    AND e.valid_from <= v_month_end AND e.valid_until >= v_month;

  SELECT COUNT(DISTINCT participant_id)::int INTO v_new_count
  FROM enrollments
  WHERE valid_from BETWEEN v_month AND v_month_end;

  SELECT COUNT(*)::int INTO v_churn_count
  FROM enrollments
  WHERE cancelled_at::date BETWEEN v_month AND v_month_end;

  v_growth_ratio := CASE
    WHEN v_churn_count = 0 AND v_new_count > 0 THEN 100
    WHEN v_churn_count = 0 THEN 50
    ELSE LEAST(100, GREATEST(0, ROUND(100.0 * v_new_count / v_churn_count, 1)))
  END;

  v_occupancy_score := LEAST(100, v_occupancy);
  v_growth_score := v_growth_ratio;
  v_total := ROUND(
    (v_occupancy_score * v_settings.occupancy_weight
     + v_growth_score * v_settings.growth_ratio_weight) / 100.0,
    1
  );

  v_color := CASE
    WHEN v_total >= v_settings.green_min THEN 'green'
    WHEN v_total >= v_settings.yellow_min THEN 'yellow'
    ELSE 'red'
  END;

  RETURN json_build_object(
    'month', v_month,
    'score', v_total,
    'color', v_color,
    'occupancy_pct', v_occupancy,
    'occupancy_component', v_occupancy_score,
    'growth_ratio', v_growth_ratio,
    'growth_component', v_growth_score,
    'new_count', v_new_count,
    'churn_count', v_churn_count,
    'weights', json_build_object(
      'occupancy', v_settings.occupancy_weight,
      'growth', v_settings.growth_ratio_weight
    ),
    'thresholds', json_build_object(
      'green_min', v_settings.green_min,
      'yellow_min', v_settings.yellow_min
    )
  );
END;
$$;

-- ── 9. get_occupancy_trend ────────────────────────────────────
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

-- ── 10. generate_operational_alerts ───────────────────────────
CREATE OR REPLACE FUNCTION public.generate_operational_alerts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_rec record;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  FOR v_rec IN
    WITH ordered AS (
      SELECT
        ae.enrollment_id,
        ae.participant_id,
        COALESCE(ss.session_date, l.lesson_date) AS session_date,
        ae.status,
        ROW_NUMBER() OVER (
          PARTITION BY ae.enrollment_id
          ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC
        ) AS rn
      FROM attendance_events ae
      LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
      LEFT JOIN lessons l ON l.id = ae.lesson_id
      WHERE ae.status IN ('present', 'absent')
    ),
    streaks AS (
      SELECT enrollment_id, participant_id,
        COUNT(*) FILTER (WHERE status = 'absent') AS consecutive_absences
      FROM ordered
      WHERE rn <= 3
      GROUP BY enrollment_id, participant_id
      HAVING COUNT(*) = 3 AND COUNT(*) FILTER (WHERE status = 'absent') = 3
    )
    SELECT
      s.enrollment_id,
      s.participant_id,
      p.full_name AS child_name
    FROM streaks s
    JOIN participants p ON p.id = s.participant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'consecutive_absences'
        AND oa.entity_type = 'enrollment'
        AND oa.entity_id = s.enrollment_id
        AND oa.acknowledged_at IS NULL
    )
  LOOP
    INSERT INTO operational_alerts (
      alert_type, severity, entity_type, entity_id, title, payload
    ) VALUES (
      'consecutive_absences',
      'warn',
      'enrollment',
      v_rec.enrollment_id,
      '3 היעדרויות ברצף: ' || v_rec.child_name,
      json_build_object('participant_id', v_rec.participant_id)
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'inserted', v_inserted);
END;
$$;

-- ── Grants ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cc_active_student_ids(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_active_student_ids(date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_school_overview_kpis(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_overview_kpis(date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_student_demographics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_demographics(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_instructor_analytics(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_analytics(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_attendance_summary(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(date, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_marketing_funnel(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketing_funnel(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_operations_daily(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operations_daily(date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_school_health_score(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_health_score(date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_occupancy_trend(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupancy_trend(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_operational_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_operational_alerts() TO authenticated;

SELECT 'Command Center analytics migration complete' AS status;
