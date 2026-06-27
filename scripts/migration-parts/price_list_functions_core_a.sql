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