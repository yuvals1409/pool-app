-- ============================================================
--  Stream Line — Central price list, customer tiers, billing
-- ============================================================

-- ── 1. Price list versions & items ──────────────────────────
CREATE TABLE IF NOT EXISTS price_list_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from  DATE NOT NULL,
  label           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS price_list_versions_effective_idx
  ON price_list_versions (effective_from DESC);

CREATE TABLE IF NOT EXISTS price_list_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id    UUID NOT NULL REFERENCES price_list_versions(id) ON DELETE CASCADE,
  product_code  TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('external', 'subscriber', 'shareholder')),
  amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (version_id, product_code, tier)
);

CREATE INDEX IF NOT EXISTS price_list_items_version_idx
  ON price_list_items (version_id, product_code);

-- ── 2. Customer status ───────────────────────────────────────
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS is_shareholder BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'external';

ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_membership_tier_check;
ALTER TABLE participants ADD CONSTRAINT participants_membership_tier_check
  CHECK (membership_tier IN ('external', 'subscriber'));

-- ── 3. Annual packages ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS participant_annual_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  season_id       UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  weekly_slots    SMALLINT NOT NULL CHECK (weekly_slots IN (1, 2)),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS participant_annual_packages_active_idx
  ON participant_annual_packages (participant_id, season_id)
  WHERE active = TRUE;

-- ── 4. Billing snapshots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id        UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  season_id             UUID REFERENCES seasons(id) ON DELETE SET NULL,
  billing_type          TEXT NOT NULL CHECK (billing_type IN ('annual_monthly', 'swim_course', 'private_package', 'private_lesson')),
  billing_month         DATE,
  enrollment_id         UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  private_package_id    UUID,
  lesson_id             UUID REFERENCES lessons(id) ON DELETE SET NULL,
  amount                NUMERIC(10,2) NOT NULL,
  sibling_discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  price_list_version_id UUID REFERENCES price_list_versions(id) ON DELETE SET NULL,
  product_code          TEXT,
  tier                  TEXT,
  payment_status        TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'waived')),
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_records_participant_idx
  ON billing_records (participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_records_paid_idx
  ON billing_records (payment_status, paid_at)
  WHERE payment_status = 'paid';

-- ── 5. Private lesson packages ───────────────────────────────
CREATE TABLE IF NOT EXISTS private_lesson_packages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  participant_id      UUID REFERENCES participants(id) ON DELETE SET NULL,
  package_code        TEXT NOT NULL CHECK (package_code IN ('private_5pack', 'private_10pack')),
  sessions_total      INT NOT NULL CHECK (sessions_total > 0),
  sessions_remaining  INT NOT NULL CHECK (sessions_remaining >= 0),
  amount_paid         NUMERIC(10,2) NOT NULL,
  purchased_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          DATE,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES profiles(id)
);

ALTER TABLE billing_records
  DROP CONSTRAINT IF EXISTS billing_records_private_package_id_fkey;
ALTER TABLE billing_records
  ADD CONSTRAINT billing_records_private_package_id_fkey
  FOREIGN KEY (private_package_id) REFERENCES private_lesson_packages(id) ON DELETE SET NULL;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS private_package_id UUID REFERENCES private_lesson_packages(id) ON DELETE SET NULL;
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS lesson_format TEXT CHECK (lesson_format IN ('single', 'double', 'package_session'));

-- ── 6. Adult style improvement template ──────────────────────
INSERT INTO product_templates (
  code, name, duration_minutes,
  entry_window_before_minutes, entry_window_after_minutes,
  schedule_pattern
) VALUES (
  'adult_style_improvement',
  'שיפור סגנון למבוגרים',
  60, 30, 30,
  '{"type":"weekly"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- ── 7. RLS ───────────────────────────────────────────────────
ALTER TABLE price_list_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_annual_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_lesson_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_list_versions_select ON price_list_versions;
CREATE POLICY price_list_versions_select ON price_list_versions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_office());

DROP POLICY IF EXISTS price_list_versions_admin_write ON price_list_versions;
CREATE POLICY price_list_versions_admin_write ON price_list_versions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS price_list_items_select ON price_list_items;
CREATE POLICY price_list_items_select ON price_list_items
  FOR SELECT TO authenticated
  USING (public.is_admin_or_office());

DROP POLICY IF EXISTS price_list_items_admin_write ON price_list_items;
CREATE POLICY price_list_items_admin_write ON price_list_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS participant_annual_packages_staff ON participant_annual_packages;
CREATE POLICY participant_annual_packages_staff ON participant_annual_packages
  FOR ALL TO authenticated
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

DROP POLICY IF EXISTS billing_records_staff ON billing_records;
CREATE POLICY billing_records_staff ON billing_records
  FOR ALL TO authenticated
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

DROP POLICY IF EXISTS private_lesson_packages_staff ON private_lesson_packages;
CREATE POLICY private_lesson_packages_staff ON private_lesson_packages
  FOR ALL TO authenticated
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ── 8. Seed initial price list ───────────────────────────────
DO $$
DECLARE
  v_version_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM price_list_versions LIMIT 1) THEN
    INSERT INTO price_list_versions (effective_from, label)
    VALUES ('2026-05-01', 'מחירון 1/5/2026')
    RETURNING id INTO v_version_id;

    INSERT INTO price_list_items (version_id, product_code, tier, amount) VALUES
      (v_version_id, 'swim_course_12', 'external', 1600),
      (v_version_id, 'swim_course_12', 'subscriber', 1400),
      (v_version_id, 'swim_course_12', 'shareholder', 1250),
      (v_version_id, 'annual_monthly_1x', 'external', 309),
      (v_version_id, 'annual_monthly_1x', 'subscriber', 209),
      (v_version_id, 'annual_monthly_1x', 'shareholder', 209),
      (v_version_id, 'annual_monthly_2x', 'external', 409),
      (v_version_id, 'annual_monthly_2x', 'subscriber', 309),
      (v_version_id, 'annual_monthly_2x', 'shareholder', 309),
      (v_version_id, 'private_single', 'external', 200),
      (v_version_id, 'private_single', 'subscriber', 170),
      (v_version_id, 'private_single', 'shareholder', 170),
      (v_version_id, 'private_5pack', 'external', 950),
      (v_version_id, 'private_5pack', 'subscriber', 800),
      (v_version_id, 'private_5pack', 'shareholder', 800),
      (v_version_id, 'private_double', 'external', 380),
      (v_version_id, 'private_double', 'subscriber', 320),
      (v_version_id, 'private_double', 'shareholder', 320),
      (v_version_id, 'private_10pack', 'external', 1750),
      (v_version_id, 'private_10pack', 'subscriber', 1450),
      (v_version_id, 'private_10pack', 'shareholder', 1450),
      (v_version_id, 'adult_style_improvement', 'external', 0),
      (v_version_id, 'adult_style_improvement', 'subscriber', 0),
      (v_version_id, 'adult_style_improvement', 'shareholder', 0);
  END IF;
END $$;

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
