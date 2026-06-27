-- ── 9. Helper: active version ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_price_list_version_id(p_as_of date DEFAULT CURRENT_DATE)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM price_list_versions
  WHERE effective_from <= COALESCE(p_as_of, CURRENT_DATE)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- ── 10. get_active_price_list (public read for landing) ──────
CREATE OR REPLACE FUNCTION public.get_active_price_list(p_as_of date DEFAULT CURRENT_DATE)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id UUID;
  v_version json;
  v_items json;
BEGIN
  v_version_id := public.get_active_price_list_version_id(p_as_of);
  IF v_version_id IS NULL THEN
    RETURN json_build_object('version', NULL, 'items', '[]'::json);
  END IF;

  SELECT json_build_object(
    'id', plv.id,
    'effective_from', plv.effective_from,
    'label', plv.label
  ) INTO v_version
  FROM price_list_versions plv
  WHERE plv.id = v_version_id;

  SELECT COALESCE(json_agg(json_build_object(
    'product_code', pli.product_code,
    'tier', pli.tier,
    'amount', pli.amount
  ) ORDER BY pli.product_code, pli.tier), '[]'::json)
  INTO v_items
  FROM price_list_items pli
  WHERE pli.version_id = v_version_id;

  RETURN json_build_object('version', v_version, 'items', v_items);
END;
$$;

-- ── 11. resolve_effective_tier ───────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_effective_tier(
  p_participant_id uuid,
  p_product_code text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership text;
  v_shareholder boolean;
BEGIN
  SELECT p.membership_tier, COALESCE(f.is_shareholder, FALSE)
  INTO v_membership, v_shareholder
  FROM participants p
  JOIN families f ON f.id = p.family_id
  WHERE p.id = p_participant_id;

  IF NOT FOUND THEN
    RETURN 'external';
  END IF;

  IF p_product_code = 'swim_course_12' AND v_shareholder THEN
    RETURN 'shareholder';
  END IF;

  IF v_shareholder THEN
    RETURN 'subscriber';
  END IF;

  RETURN COALESCE(v_membership, 'external');
END;
$$;

-- ── 12. get_price_list_amount ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_price_list_amount(
  p_product_code text,
  p_tier text,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id UUID;
  v_amount numeric;
  v_tier text := p_tier;
BEGIN
  IF p_product_code <> 'swim_course_12' AND v_tier = 'shareholder' THEN
    v_tier := 'subscriber';
  END IF;

  v_version_id := public.get_active_price_list_version_id(p_as_of);
  IF v_version_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT amount INTO v_amount
  FROM price_list_items
  WHERE version_id = v_version_id
    AND product_code = p_product_code
    AND tier = v_tier;

  RETURN v_amount;
END;
$$;

-- ── 13. sibling discount eligibility ─────────────────────────
CREATE OR REPLACE FUNCTION public.sibling_discount_eligible(
  p_participant_id uuid,
  p_enrollment_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_my_created timestamptz;
  v_has_older_sibling boolean;
BEGIN
  SELECT p.family_id INTO v_family_id
  FROM participants p WHERE p.id = p_participant_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF p_enrollment_id IS NOT NULL THEN
    SELECT e.created_at INTO v_my_created
    FROM enrollments e
    WHERE e.id = p_enrollment_id AND e.participant_id = p_participant_id;
    IF NOT FOUND THEN RETURN 0; END IF;
  ELSE
    v_my_created := now();
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM participants sib
    JOIN enrollments e ON e.participant_id = sib.id AND e.active = TRUE
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    WHERE sib.family_id = v_family_id
      AND sib.id <> p_participant_id
      AND pt.code IN ('annual_section', 'summer_course')
      AND e.created_at < v_my_created
  ) INTO v_has_older_sibling;

  IF NOT v_has_older_sibling THEN
    RETURN 0;
  END IF;

  IF p_enrollment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM enrollments e
      JOIN products pr ON pr.id = e.product_id
      JOIN product_templates pt ON pt.id = pr.template_id
      WHERE e.id = p_enrollment_id
        AND pt.code IN ('annual_section', 'summer_course')
    ) THEN
      RETURN 0;
    END IF;
  END IF;

  RETURN 10;
END;
$$;

-- ── 14. suggest_payment_amount ───────────────────────────────
CREATE OR REPLACE FUNCTION public.suggest_payment_amount(
  p_participant_id uuid,
  p_billing_type text,
  p_enrollment_id uuid DEFAULT NULL,
  p_billing_month date DEFAULT NULL,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_code text;
  v_tier text;
  v_base numeric;
  v_discount_pct numeric := 0;
  v_final numeric;
  v_version_id uuid;
  v_weekly_slots int;
  v_season_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  v_version_id := public.get_active_price_list_version_id(p_as_of);

  IF p_billing_type = 'swim_course' THEN
    v_product_code := 'swim_course_12';
    v_tier := public.resolve_effective_tier(p_participant_id, v_product_code);
    v_base := public.get_price_list_amount(v_product_code, v_tier, p_as_of);
    v_discount_pct := public.sibling_discount_eligible(p_participant_id, p_enrollment_id);

  ELSIF p_billing_type = 'annual_monthly' THEN
    SELECT pap.weekly_slots, pap.season_id
    INTO v_weekly_slots, v_season_id
    FROM participant_annual_packages pap
    WHERE pap.participant_id = p_participant_id
      AND pap.active = TRUE
    ORDER BY pap.created_at DESC
    LIMIT 1;

    IF v_weekly_slots IS NULL THEN
      RETURN json_build_object('error', 'no_annual_package');
    END IF;

    v_product_code := CASE WHEN v_weekly_slots = 2 THEN 'annual_monthly_2x' ELSE 'annual_monthly_1x' END;
    v_tier := public.resolve_effective_tier(p_participant_id, v_product_code);
    v_base := public.get_price_list_amount(v_product_code, v_tier, p_as_of);
    v_discount_pct := 0;
    IF p_enrollment_id IS NOT NULL THEN
      v_discount_pct := public.sibling_discount_eligible(p_participant_id, p_enrollment_id);
    END IF;

  ELSE
    RETURN json_build_object('error', 'invalid_billing_type');
  END IF;

  IF v_base IS NULL THEN
    RETURN json_build_object('error', 'no_price');
  END IF;

  v_final := ROUND(v_base * (1 - v_discount_pct / 100.0), 2);

  RETURN json_build_object(
    'product_code', v_product_code,
    'tier', v_tier,
    'base_amount', v_base,
    'sibling_discount_pct', v_discount_pct,
    'suggested_amount', v_final,
    'price_list_version_id', v_version_id,
    'billing_type', p_billing_type,
    'billing_month', p_billing_month
  );
END;
$$;

-- ── 15. record_billing_payment ───────────────────────────────
CREATE OR REPLACE FUNCTION public.record_billing_payment(
  p_participant_id uuid,
  p_billing_type text,
  p_amount numeric,
  p_payment_status text,
  p_enrollment_id uuid DEFAULT NULL,
  p_billing_month date DEFAULT NULL,
  p_season_id uuid DEFAULT NULL,
  p_product_code text DEFAULT NULL,
  p_tier text DEFAULT NULL,
  p_sibling_discount_pct numeric DEFAULT 0,
  p_price_list_version_id uuid DEFAULT NULL,
  p_private_package_id uuid DEFAULT NULL,
  p_lesson_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text := COALESCE(p_payment_status, 'paid');
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF v_status NOT IN ('paid', 'waived', 'unpaid') THEN
    RETURN json_build_object('error', 'invalid_status');
  END IF;

  INSERT INTO billing_records (
    participant_id, season_id, billing_type, billing_month,
    enrollment_id, private_package_id, lesson_id,
    amount, sibling_discount_pct, price_list_version_id,
    product_code, tier, payment_status, paid_at, notes, created_by
  ) VALUES (
    p_participant_id, p_season_id, p_billing_type, p_billing_month,
    p_enrollment_id, p_private_package_id, p_lesson_id,
    COALESCE(p_amount, 0), COALESCE(p_sibling_discount_pct, 0), p_price_list_version_id,
    p_product_code, p_tier, v_status,
    CASE WHEN v_status = 'paid' THEN now() ELSE NULL END,
    p_notes, auth.uid()
  )
  RETURNING id INTO v_id;

  IF p_enrollment_id IS NOT NULL AND v_status IN ('paid', 'waived') THEN
    UPDATE enrollments SET payment_status = v_status WHERE id = p_enrollment_id;
  END IF;

  IF p_lesson_id IS NOT NULL AND v_status IN ('paid', 'waived') THEN
    UPDATE lessons SET payment_status = v_status WHERE id = p_lesson_id;
  END IF;

  RETURN json_build_object('result', 'ok', 'billing_record_id', v_id);
END;
$$;

-- ── 16. Private package purchase ─────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_private_package(
  p_family_id uuid,
  p_package_code text,
  p_participant_id uuid DEFAULT NULL,
  p_amount_override numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
  v_tier text;
  v_amount numeric;
  v_total int;
  v_pkg_id uuid;
  v_version_id uuid;
  v_billing_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  v_participant_id := p_participant_id;
  IF v_participant_id IS NULL THEN
    SELECT id INTO v_participant_id
    FROM participants WHERE family_id = p_family_id
    ORDER BY created_at LIMIT 1;
  END IF;

  IF v_participant_id IS NULL THEN
    RETURN json_build_object('error', 'no_participant');
  END IF;

  v_tier := public.resolve_effective_tier(v_participant_id, p_package_code);
  v_amount := COALESCE(p_amount_override, public.get_price_list_amount(p_package_code, v_tier, CURRENT_DATE));
  v_version_id := public.get_active_price_list_version_id(CURRENT_DATE);

  v_total := CASE p_package_code
    WHEN 'private_5pack' THEN 5
    WHEN 'private_10pack' THEN 10
    ELSE NULL
  END;

  IF v_total IS NULL OR v_amount IS NULL THEN
    RETURN json_build_object('error', 'invalid_package');
  END IF;

  INSERT INTO private_lesson_packages (
    family_id, participant_id, package_code,
    sessions_total, sessions_remaining, amount_paid, created_by
  ) VALUES (
    p_family_id, p_participant_id, p_package_code,
    v_total, v_total, v_amount, auth.uid()
  )
  RETURNING id INTO v_pkg_id;

  INSERT INTO billing_records (
    participant_id, billing_type, private_package_id,
    amount, price_list_version_id, product_code, tier,
    payment_status, paid_at, created_by
  ) VALUES (
    v_participant_id, 'private_package', v_pkg_id,
    v_amount, v_version_id, p_package_code, v_tier,
    'paid', now(), auth.uid()
  )
  RETURNING id INTO v_billing_id;

  RETURN json_build_object(
    'result', 'ok',
    'package_id', v_pkg_id,
    'billing_record_id', v_billing_id,
    'amount', v_amount,
    'sessions_remaining', v_total
  );
END;
$$;

-- ── 17. consume_package_session ──────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_package_session(p_package_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int;
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT public.is_admin_or_office()
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'instructor'
    )
  THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  UPDATE private_lesson_packages
  SET sessions_remaining = sessions_remaining - 1,
      active = (sessions_remaining - 1) > 0
  WHERE id = p_package_id
    AND active = TRUE
    AND sessions_remaining > 0
  RETURNING sessions_remaining INTO v_remaining;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_sessions');
  END IF;

  RETURN json_build_object('result', 'ok', 'sessions_remaining', v_remaining);
END;
$$;

-- ── 18. suggest_private_lesson_price ─────────────────────────
CREATE OR REPLACE FUNCTION public.suggest_private_lesson_price(
  p_participant_id uuid,
  p_lesson_format text DEFAULT 'single',
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_tier text;
  v_amount numeric;
BEGIN
  v_code := CASE p_lesson_format
    WHEN 'double' THEN 'private_double'
    ELSE 'private_single'
  END;

  v_tier := public.resolve_effective_tier(p_participant_id, v_code);
  v_amount := public.get_price_list_amount(v_code, v_tier, p_as_of);

  RETURN json_build_object(
    'product_code', v_code,
    'tier', v_tier,
    'suggested_amount', v_amount,
    'price_list_version_id', public.get_active_price_list_version_id(p_as_of)
  );
END;
$$;

-- ── 19. Price list admin: list versions ──────────────────────
CREATE OR REPLACE FUNCTION public.list_price_list_versions()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'effective_from', effective_from,
      'label', label, 'created_at', created_at
    ) ORDER BY effective_from DESC)
    FROM price_list_versions
  ), '[]'::json);
END;
$$;

-- ── 20. Create new price list version (copy from latest) ─────
CREATE OR REPLACE FUNCTION public.create_price_list_version(
  p_effective_from date,
  p_label text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
  v_src_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  INSERT INTO price_list_versions (effective_from, label, created_by)
  VALUES (p_effective_from, p_label, auth.uid())
  RETURNING id INTO v_new_id;

  SELECT id INTO v_src_id
  FROM price_list_versions
  WHERE id <> v_new_id
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_src_id IS NOT NULL THEN
    INSERT INTO price_list_items (version_id, product_code, tier, amount)
    SELECT v_new_id, product_code, tier, amount
    FROM price_list_items
    WHERE version_id = v_src_id;
  END IF;

  RETURN json_build_object('result', 'ok', 'version_id', v_new_id);
END;
$$;

-- ── 21. Update single price list item ────────────────────────
CREATE OR REPLACE FUNCTION public.update_price_list_item(
  p_version_id uuid,
  p_product_code text,
  p_tier text,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  INSERT INTO price_list_items (version_id, product_code, tier, amount)
  VALUES (p_version_id, p_product_code, p_tier, p_amount)
  ON CONFLICT (version_id, product_code, tier)
  DO UPDATE SET amount = EXCLUDED.amount;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── 22. Upsert annual package ────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_annual_package(
  p_participant_id uuid,
  p_season_id uuid,
  p_weekly_slots smallint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  UPDATE participant_annual_packages
  SET active = FALSE
  WHERE participant_id = p_participant_id
    AND season_id = p_season_id
    AND active = TRUE;

  INSERT INTO participant_annual_packages (participant_id, season_id, weekly_slots)
  VALUES (p_participant_id, p_season_id, p_weekly_slots)
  RETURNING id INTO v_id;

  RETURN json_build_object('result', 'ok', 'package_id', v_id);
END;
$$;

-- ── 23. Count annual enrollments for mismatch ────────────────
CREATE OR REPLACE FUNCTION public.count_annual_enrollments(
  p_participant_id uuid,
  p_season_id uuid
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE e.participant_id = p_participant_id
    AND e.active = TRUE
    AND pr.season_id = p_season_id
    AND pt.code = 'annual_section';
$$;