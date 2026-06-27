-- ── 24. Extend generate_operational_alerts ───────────────────
CREATE OR REPLACE FUNCTION public.generate_operational_alerts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_rec record;
  v_next_season_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT id INTO v_next_season_id
  FROM seasons
  WHERE start_date > COALESCE(
    (SELECT start_date FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1),
    CURRENT_DATE
  )
  ORDER BY start_date ASC
  LIMIT 1;

  -- 1. Consecutive absences
  FOR v_rec IN
    WITH ordered AS (
      SELECT ae.enrollment_id, ae.participant_id, ae.status,
        ROW_NUMBER() OVER (PARTITION BY ae.enrollment_id ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC) AS rn
      FROM attendance_events ae
      LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
      LEFT JOIN lessons l ON l.id = ae.lesson_id
      WHERE ae.status IN ('present', 'absent')
    ),
    streaks AS (
      SELECT enrollment_id, participant_id FROM ordered
      WHERE rn <= 3
      GROUP BY enrollment_id, participant_id
      HAVING COUNT(*) = 3 AND COUNT(*) FILTER (WHERE status = 'absent') = 3
    )
    SELECT s.enrollment_id, s.participant_id, p.full_name AS child_name
    FROM streaks s JOIN participants p ON p.id = s.participant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'consecutive_absences' AND oa.entity_type = 'enrollment'
        AND oa.entity_id = s.enrollment_id AND oa.acknowledged_at IS NULL
    )
  LOOP
    INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
    VALUES ('consecutive_absences', 'warn', 'enrollment', v_rec.enrollment_id,
      '3 היעדרויות ברצף: ' || v_rec.child_name,
      json_build_object('participant_id', v_rec.participant_id));
    v_inserted := v_inserted + 1;
  END LOOP;

  -- 2. Churn risk
  IF v_next_season_id IS NOT NULL THEN
    FOR v_rec IN
      WITH ordered AS (
        SELECT ae.enrollment_id, ae.participant_id, ae.status,
          ROW_NUMBER() OVER (PARTITION BY ae.enrollment_id ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC) AS rn
        FROM attendance_events ae
        JOIN enrollments e ON e.id = ae.enrollment_id AND e.active = TRUE
        LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        LEFT JOIN lessons l ON l.id = ae.lesson_id
        WHERE ae.status IN ('present', 'absent')
      ),
      at_risk AS (
        SELECT DISTINCT o.participant_id FROM ordered o
        WHERE o.rn <= 3
        GROUP BY o.enrollment_id, o.participant_id
        HAVING COUNT(*) FILTER (WHERE o.status = 'absent') >= 2
      )
      SELECT ar.participant_id, p.full_name AS child_name
      FROM at_risk ar JOIN participants p ON p.id = ar.participant_id
      WHERE NOT EXISTS (
        SELECT 1 FROM enrollments e JOIN products pr ON pr.id = e.product_id
        WHERE e.participant_id = ar.participant_id AND e.active = TRUE AND pr.season_id = v_next_season_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM operational_alerts oa
        WHERE oa.alert_type = 'churn_risk' AND oa.entity_type = 'participant'
          AND oa.entity_id = ar.participant_id AND oa.acknowledged_at IS NULL
      )
    LOOP
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES ('churn_risk', 'warn', 'participant', v_rec.participant_id,
        'סיכון עזיבה: ' || v_rec.child_name,
        json_build_object('participant_id', v_rec.participant_id, 'next_season_id', v_next_season_id));
      v_inserted := v_inserted + 1;
    END LOOP;
  END IF;

  -- 3. Capacity full
  FOR v_rec IN
    SELECT pr.id AS product_id, pr.name AS product_name, COUNT(e.id)::int AS enrolled, pr.capacity
    FROM products pr JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
    WHERE pr.capacity IS NOT NULL AND pr.capacity > 0
    GROUP BY pr.id, pr.name, pr.capacity HAVING COUNT(e.id) >= pr.capacity
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'capacity_full' AND oa.entity_type = 'product'
        AND oa.entity_id = v_rec.product_id AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES ('capacity_full', 'info', 'product', v_rec.product_id,
        'קבוצה מלאה: ' || v_rec.product_name,
        json_build_object('enrolled', v_rec.enrolled, 'capacity', v_rec.capacity));
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- 4. Capacity low
  FOR v_rec IN
    SELECT pr.id AS product_id, pr.name AS product_name, COUNT(e.id)::int AS enrolled, pr.capacity
    FROM products pr LEFT JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
    WHERE pr.capacity IS NOT NULL AND pr.capacity >= 4
    GROUP BY pr.id, pr.name, pr.capacity
    HAVING COUNT(e.id)::numeric / pr.capacity < 0.5
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'capacity_low' AND oa.entity_type = 'product'
        AND oa.entity_id = v_rec.product_id AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES ('capacity_low', 'warn', 'product', v_rec.product_id,
        'תפוסה נמוכה: ' || v_rec.product_name,
        json_build_object('enrolled', v_rec.enrolled, 'capacity', v_rec.capacity));
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- 5. Package mismatch (annual)
  FOR v_rec IN
    SELECT
      pap.participant_id,
      pap.season_id,
      pap.weekly_slots,
      public.count_annual_enrollments(pap.participant_id, pap.season_id) AS enrolled_count,
      p.full_name AS child_name
    FROM participant_annual_packages pap
    JOIN participants p ON p.id = pap.participant_id
    WHERE pap.active = TRUE
      AND pap.weekly_slots <> public.count_annual_enrollments(pap.participant_id, pap.season_id)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'package_mismatch' AND oa.entity_type = 'participant'
        AND oa.entity_id = v_rec.participant_id AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES (
        'package_mismatch', 'warn', 'participant', v_rec.participant_id,
        'חוסר התאמה חבילה: ' || v_rec.child_name,
        json_build_object(
          'weekly_slots', v_rec.weekly_slots,
          'enrolled_count', v_rec.enrolled_count,
          'season_id', v_rec.season_id
        )
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'inserted', v_inserted);
END;
$$;

-- ── 25. get_revenue_breakdown (billing_records) ──────────────
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
      CASE br.billing_type
        WHEN 'annual_monthly' THEN 'annual'
        WHEN 'swim_course' THEN 'summer'
        WHEN 'private_package' THEN 'private'
        WHEN 'private_lesson' THEN 'private'
        ELSE br.billing_type
      END AS domain,
      COUNT(*) FILTER (WHERE br.payment_status = 'paid')::int AS paid_count,
      COALESCE(SUM(CASE WHEN br.payment_status = 'paid' THEN br.amount ELSE 0 END), 0)::numeric(12,2) AS revenue
    FROM billing_records br
    WHERE br.payment_status = 'paid'
      AND COALESCE(br.paid_at::date, br.created_at::date) BETWEEN p_from AND p_to
    GROUP BY 1
    UNION ALL
    SELECT 'legacy_enrollment', COUNT(*)::int,
      COALESCE(SUM(COALESCE(p.price, 0)), 0)::numeric(12,2)
    FROM enrollments e
    JOIN products p ON p.id = e.product_id
    WHERE e.payment_status = 'paid' AND e.active = TRUE
      AND e.valid_from BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.enrollment_id = e.id)
    UNION ALL
    SELECT 'legacy_private', COUNT(*)::int,
      COALESCE(SUM(COALESCE(l.price, 0)), 0)::numeric(12,2)
    FROM lessons l
    WHERE l.payment_status = 'paid' AND NOT l.cancelled
      AND l.lesson_date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.lesson_id = l.id)
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month_start), '[]'::json)
  INTO v_monthly
  FROM (
    SELECT date_trunc('month', sub.dt)::date AS month_start,
      COALESCE(SUM(sub.amount), 0)::numeric(12,2) AS revenue
    FROM (
      SELECT COALESCE(br.paid_at::date, br.created_at::date) AS dt,
        CASE WHEN br.payment_status = 'paid' THEN br.amount ELSE 0 END AS amount
      FROM billing_records br
      WHERE br.payment_status = 'paid'
        AND COALESCE(br.paid_at::date, br.created_at::date) BETWEEN p_from AND p_to
      UNION ALL
      SELECT e.valid_from, COALESCE(p.price, 0)
      FROM enrollments e JOIN products p ON p.id = e.product_id
      WHERE e.payment_status = 'paid' AND e.active = TRUE AND e.valid_from BETWEEN p_from AND p_to
        AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.enrollment_id = e.id)
      UNION ALL
      SELECT l.lesson_date, COALESCE(l.price, 0)
      FROM lessons l
      WHERE l.payment_status = 'paid' AND NOT l.cancelled AND l.lesson_date BETWEEN p_from AND p_to
        AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.lesson_id = l.id)
    ) sub
    WHERE sub.amount > 0
    GROUP BY 1
  ) t;

  SELECT COUNT(DISTINCT payer_id)::int, COALESCE(SUM(rev), 0)::numeric(12,2)
  INTO v_paying, v_total
  FROM (
    SELECT br.participant_id AS payer_id,
      CASE WHEN br.payment_status = 'paid' THEN br.amount ELSE 0 END AS rev
    FROM billing_records br
    WHERE br.payment_status = 'paid'
      AND COALESCE(br.paid_at::date, br.created_at::date) BETWEEN p_from AND p_to
    UNION ALL
    SELECT e.participant_id, COALESCE(p.price, 0)
    FROM enrollments e JOIN products p ON p.id = e.product_id
    WHERE e.payment_status = 'paid' AND e.active = TRUE AND e.valid_from BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.enrollment_id = e.id)
    UNION ALL
    SELECT NULL::uuid, COALESCE(l.price, 0)
    FROM lessons l
    WHERE l.payment_status = 'paid' AND NOT l.cancelled AND l.lesson_date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.lesson_id = l.id)
  ) payers;

  v_avg := CASE WHEN v_paying > 0 THEN ROUND(v_total / v_paying, 2) ELSE 0 END;

  RETURN json_build_object(
    'from', p_from, 'to', p_to,
    'by_domain', v_by_domain, 'monthly', v_monthly,
    'total_revenue', v_total, 'paying_customers', v_paying,
    'avg_revenue_per_customer', v_avg
  );
END;
$$;

-- ── 26. get_revenue_by_season (billing + legacy) ─────────────
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
        COUNT(DISTINCT br.id) FILTER (WHERE br.payment_status = 'paid')::int AS paid_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.payment_status = 'unpaid' AND e.active)::int AS unpaid_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.payment_status = 'waived' AND e.active)::int AS waived_count,
        (
          COALESCE(SUM(br.amount) FILTER (WHERE br.payment_status = 'paid' AND br.season_id = s.id), 0)
          + COALESCE((
            SELECT SUM(COALESCE(p2.price, 0))
            FROM enrollments e2 JOIN products p2 ON p2.id = e2.product_id
            WHERE e2.payment_status = 'paid' AND e2.active AND p2.season_id = s.id
              AND NOT EXISTS (SELECT 1 FROM billing_records br2 WHERE br2.enrollment_id = e2.id)
          ), 0)
        )::numeric(12,2) AS gross_revenue
      FROM seasons s
      LEFT JOIN billing_records br ON br.season_id = s.id
      LEFT JOIN products pr ON pr.season_id = s.id
      LEFT JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
      WHERE p_season_id IS NULL OR s.id = p_season_id
      GROUP BY s.id, s.name
    ) t
  ), '[]'::json);
END;
$$;

-- ── 27. Backfill legacy paid records ─────────────────────────
INSERT INTO billing_records (
  participant_id, season_id, billing_type, enrollment_id,
  amount, product_code, tier, payment_status, paid_at, notes
)
SELECT
  e.participant_id,
  pr.season_id,
  CASE WHEN pt.code = 'summer_course' THEN 'swim_course' ELSE 'annual_monthly' END,
  e.id,
  COALESCE(pr.price, 0),
  CASE WHEN pt.code = 'summer_course' THEN 'swim_course_12' ELSE 'annual_monthly_1x' END,
  'external',
  e.payment_status,
  e.created_at,
  'backfill from enrollment'
FROM enrollments e
JOIN products pr ON pr.id = e.product_id
JOIN product_templates pt ON pt.id = pr.template_id
WHERE e.payment_status IN ('paid', 'waived')
  AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.enrollment_id = e.id);

INSERT INTO billing_records (
  participant_id, billing_type, lesson_id, amount,
  product_code, tier, payment_status, paid_at, notes
)
SELECT
  COALESCE((
    SELECT p.id FROM participants p
    JOIN families f ON f.id = p.family_id
    WHERE f.phone = l.parent_phone
    ORDER BY p.created_at LIMIT 1
  ), (SELECT id FROM participants ORDER BY created_at LIMIT 1)),
  'private_lesson',
  l.id,
  COALESCE(l.price, 0),
  'private_single',
  'external',
  l.payment_status,
  l.created_at,
  'backfill from lesson'
FROM lessons l
WHERE l.payment_status IN ('paid', 'waived')
  AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.lesson_id = l.id)
  AND EXISTS (
    SELECT 1 FROM participants p
    JOIN families f ON f.id = p.family_id
    WHERE f.phone = l.parent_phone
  );

-- ── 28. Grants ───────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_active_price_list(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_price_list(date) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_active_price_list_version_id(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_price_list_version_id(date) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_effective_tier(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_effective_tier(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_price_list_amount(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_price_list_amount(text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.sibling_discount_eligible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sibling_discount_eligible(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.suggest_payment_amount(uuid, text, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_payment_amount(uuid, text, uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.record_billing_payment(uuid, text, numeric, text, uuid, date, uuid, text, text, numeric, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_billing_payment(uuid, text, numeric, text, uuid, date, uuid, text, text, numeric, uuid, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.purchase_private_package(uuid, text, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_private_package(uuid, text, uuid, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.consume_package_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_package_session(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.suggest_private_lesson_price(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_private_lesson_price(uuid, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.list_price_list_versions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_price_list_versions() TO authenticated;

REVOKE ALL ON FUNCTION public.create_price_list_version(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_price_list_version(date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_price_list_item(uuid, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_price_list_item(uuid, text, text, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_annual_package(uuid, uuid, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_annual_package(uuid, uuid, smallint) TO authenticated;

REVOKE ALL ON FUNCTION public.count_annual_enrollments(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_annual_enrollments(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_by_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_season(uuid) TO authenticated;

SELECT 'Price list migration complete' AS status;