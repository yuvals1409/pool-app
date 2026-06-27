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