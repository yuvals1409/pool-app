-- ============================================================
--  Command Center — Foundation (שלב 1)
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- ── 1. participants ─────────────────────────────────────────
-- נרמול מגדר מייבוא ישן (ז'/נ' = זכר/נקבה) לפני CHECK
UPDATE participants SET gender = 'male' WHERE gender IN ('ז''', 'זכר', 'ז', 'm', 'M');
UPDATE participants SET gender = 'female' WHERE gender IN ('נ''', 'נקבה', 'נ', 'f', 'F');

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS first_enrolled_at DATE;

ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_grade_check;
ALTER TABLE participants ADD CONSTRAINT participants_grade_check
  CHECK (grade IS NULL OR grade IN (
    'גן', 'א''', 'ב''', 'ג''', 'ד''', 'ה''', 'ו''', 'ז''', 'ח''', 'ט''', 'י''-י"ב'
  ));

ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_gender_check;
ALTER TABLE participants ADD CONSTRAINT participants_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

UPDATE participants p
SET first_enrolled_at = sub.min_date
FROM (
  SELECT participant_id, MIN(valid_from) AS min_date
  FROM enrollments
  GROUP BY participant_id
) sub
WHERE p.id = sub.participant_id
  AND p.first_enrolled_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_participant_first_enrolled_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE participants
  SET first_enrolled_at = LEAST(
    COALESCE(first_enrolled_at, NEW.valid_from),
    NEW.valid_from
  )
  WHERE id = NEW.participant_id
    AND first_enrolled_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enrollments_set_first_enrolled_at ON enrollments;
CREATE TRIGGER enrollments_set_first_enrolled_at
  AFTER INSERT ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_participant_first_enrolled_at();

-- ── 2. enrollments ──────────────────────────────────────────
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE enrollments
SET cancelled_at = created_at
WHERE active = FALSE AND cancelled_at IS NULL;

-- ── 3. profiles (instructor hire date) ────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hired_at DATE;

UPDATE profiles
SET hired_at = created_at::date
WHERE hired_at IS NULL
  AND role = 'instructor'
  AND status = 'approved';

-- ── 4. private lessons — price & payment ──────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS payment_status TEXT;

UPDATE lessons SET payment_status = 'unpaid' WHERE payment_status IS NULL;

ALTER TABLE lessons ALTER COLUMN payment_status SET DEFAULT 'unpaid';
ALTER TABLE lessons ALTER COLUMN payment_status SET NOT NULL;

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_payment_status_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid', 'waived'));

-- ── 5. lead sources ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_lead_source(p_source text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_source text;
BEGIN
  v_source := lower(trim(COALESCE(p_source, '')));
  IF v_source IN ('recommendation', 'facebook', 'instagram', 'website', 'signage', 'import') THEN
    RETURN v_source;
  END IF;
  IF v_source IN ('web', 'אתר', 'אתר אינטרנט') THEN RETURN 'website'; END IF;
  IF v_source IN ('פייסבוק', 'fb') THEN RETURN 'facebook'; END IF;
  IF v_source IN ('אינסטגרם', 'ig', 'instagram') THEN RETURN 'instagram'; END IF;
  IF v_source IN ('מפה לאוזן', 'המלצה', 'פה לאוזן', 'word of mouth') THEN RETURN 'recommendation'; END IF;
  IF v_source IN ('שילוט', 'signage') THEN RETURN 'signage'; END IF;
  RETURN 'website';
END;
$$;

ALTER TABLE assessment_leads DROP CONSTRAINT IF EXISTS assessment_leads_source_check;
ALTER TABLE assessment_leads ADD CONSTRAINT assessment_leads_source_check
  CHECK (source IN ('facebook', 'instagram', 'recommendation', 'website', 'signage', 'import'));

-- ── 6. school_health_settings ─────────────────────────────────
CREATE TABLE IF NOT EXISTS school_health_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occupancy_weight      NUMERIC(5,2) NOT NULL DEFAULT 60
    CHECK (occupancy_weight >= 0 AND occupancy_weight <= 100),
  growth_ratio_weight   NUMERIC(5,2) NOT NULL DEFAULT 40
    CHECK (growth_ratio_weight >= 0 AND growth_ratio_weight <= 100),
  green_min             NUMERIC(5,2) NOT NULL DEFAULT 80
    CHECK (green_min >= 0 AND green_min <= 100),
  yellow_min            NUMERIC(5,2) NOT NULL DEFAULT 60
    CHECK (yellow_min >= 0 AND yellow_min <= 100),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_by            UUID REFERENCES profiles(id)
);

INSERT INTO school_health_settings (occupancy_weight, growth_ratio_weight, green_min, yellow_min)
SELECT 60, 40, 80, 60
WHERE NOT EXISTS (SELECT 1 FROM school_health_settings LIMIT 1);

ALTER TABLE school_health_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read school health settings" ON school_health_settings;
CREATE POLICY "admin read school health settings"
  ON school_health_settings FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin update school health settings" ON school_health_settings;
CREATE POLICY "admin update school health settings"
  ON school_health_settings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 7. operational_alerts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS operational_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type       TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  entity_type      TEXT,
  entity_id        UUID,
  title            TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  acknowledged_at  TIMESTAMPTZ,
  acknowledged_by  UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_alerts_open_idx
  ON operational_alerts (created_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE operational_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read operational alerts" ON operational_alerts;
CREATE POLICY "staff read operational alerts"
  ON operational_alerts FOR SELECT
  USING (public.is_admin_or_office());

DROP POLICY IF EXISTS "staff manage operational alerts" ON operational_alerts;
CREATE POLICY "staff manage operational alerts"
  ON operational_alerts FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ── 8. cancel_enrollment — set cancelled_at ───────────────────
CREATE OR REPLACE FUNCTION public.cancel_enrollment(p_enrollment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment record;
  v_lead record;
  v_product_id uuid;
  v_slot_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_enrollment
  FROM enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_enrollment.active THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  v_product_id := v_enrollment.product_id;

  UPDATE enrollments
  SET active = FALSE, cancelled_at = NOW()
  WHERE id = p_enrollment_id;

  UPDATE access_passes
  SET status = 'cancelled'
  WHERE enrollment_id = p_enrollment_id AND status = 'active';

  SELECT al.slot_id INTO v_slot_id
  FROM assessment_leads al
  WHERE al.enrollment_id = p_enrollment_id
  LIMIT 1;

  IF v_slot_id IS NOT NULL THEN
    UPDATE assessment_slots
    SET enrolled_count = GREATEST(enrolled_count - 1, 0)
    WHERE id = v_slot_id;
    PERFORM public.try_promote_waitlist('assessment_slot', v_slot_id);
  ELSE
    PERFORM public.try_promote_waitlist('product', v_product_id);
  END IF;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── 9. register_assessment — gender, grade, birth_date ────────
DROP FUNCTION IF EXISTS public.register_assessment(uuid, text, integer, text, text);
DROP FUNCTION IF EXISTS public.register_assessment(uuid, text, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.register_assessment(
  p_slot_id uuid,
  p_child_name text,
  p_child_age integer,
  p_parent_name text,
  p_phone text,
  p_source text DEFAULT 'website',
  p_gender text DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_birth_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_product_id uuid;
  v_session_id uuid;
  v_family_id uuid;
  v_participant_id uuid;
  v_enrollment_id uuid;
  v_pass_id uuid;
  v_public_token uuid;
  v_qr_token uuid;
  v_phone text;
  v_child_name text;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_template record;
  v_birth_date date;
  v_existing_enrollment uuid;
  v_source text;
  v_gender text;
  v_grade text;
BEGIN
  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));
  v_source := public.normalize_lead_source(p_source);
  v_gender := NULLIF(lower(trim(COALESCE(p_gender, ''))), '');
  v_grade := NULLIF(trim(COALESCE(p_grade, '')), '');

  IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female') THEN
    RETURN json_build_object('result', 'invalid_gender');
  END IF;

  IF v_phone = '' OR v_child_name = '' THEN
    RETURN json_build_object('result', 'invalid_input');
  END IF;

  SELECT * INTO v_slot
  FROM assessment_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'slot_not_found');
  END IF;

  IF NOT v_slot.active OR v_slot.slot_date < CURRENT_DATE THEN
    RETURN json_build_object('result', 'slot_unavailable');
  END IF;

  IF v_slot.enrolled_count >= v_slot.capacity THEN
    RETURN json_build_object('result', 'slot_full');
  END IF;

  v_product_id := public.ensure_assessment_product();

  IF v_slot.session_id IS NULL THEN
    v_session_id := public.sync_assessment_slot_session(p_slot_id);
  ELSE
    v_session_id := v_slot.session_id;
  END IF;

  SELECT * INTO v_template
  FROM product_templates
  WHERE code = 'swim_assessment';

  SELECT id INTO v_family_id
  FROM families
  WHERE phone = v_phone;

  IF v_family_id IS NULL THEN
    INSERT INTO families (phone, parent_name)
    VALUES (v_phone, NULLIF(trim(COALESCE(p_parent_name, '')), ''))
    RETURNING id INTO v_family_id;
  ELSIF p_parent_name IS NOT NULL AND trim(p_parent_name) <> '' THEN
    UPDATE families SET parent_name = trim(p_parent_name) WHERE id = v_family_id;
  END IF;

  v_birth_date := p_birth_date;
  IF v_birth_date IS NULL AND p_child_age IS NOT NULL AND p_child_age > 0 AND p_child_age < 120 THEN
    v_birth_date := (CURRENT_DATE - (p_child_age * interval '1 year'))::date;
  END IF;

  SELECT id INTO v_participant_id
  FROM participants
  WHERE family_id = v_family_id
    AND lower(trim(full_name)) = lower(v_child_name);

  IF v_participant_id IS NULL THEN
    INSERT INTO participants (family_id, full_name, birth_date, gender, grade)
    VALUES (v_family_id, v_child_name, v_birth_date, v_gender, v_grade)
    RETURNING id INTO v_participant_id;
  ELSE
    UPDATE participants SET
      birth_date = COALESCE(v_birth_date, birth_date),
      gender = COALESCE(v_gender, gender),
      grade = COALESCE(v_grade, grade)
    WHERE id = v_participant_id;
  END IF;

  SELECT id INTO v_existing_enrollment
  FROM enrollments
  WHERE participant_id = v_participant_id
    AND product_id = v_product_id
    AND active = TRUE;

  IF v_existing_enrollment IS NOT NULL THEN
    RETURN json_build_object('result', 'duplicate_enrollment');
  END IF;

  INSERT INTO enrollments (
    product_id, participant_id, payment_status,
    valid_from, valid_until, active
  ) VALUES (
    v_product_id, v_participant_id, 'waived',
    v_slot.slot_date, v_slot.slot_date, TRUE
  )
  RETURNING id INTO v_enrollment_id;

  INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
  VALUES (v_session_id, v_enrollment_id, v_participant_id)
  ON CONFLICT (session_id, enrollment_id) DO NOTHING;

  SELECT ss.start_time INTO v_slot.start_time
  FROM scheduled_sessions ss
  WHERE ss.id = v_session_id;

  v_valid_from := (v_slot.slot_date + v_slot.start_time)
    - make_interval(mins => COALESCE(v_template.entry_window_before_minutes, 30));
  v_valid_until := (v_slot.slot_date + v_slot.start_time)
    + make_interval(mins => COALESCE(v_template.duration_minutes, 30)
      + COALESCE(v_template.entry_window_after_minutes, 30));

  INSERT INTO access_passes (
    session_id, enrollment_id, participant_id,
    valid_from, valid_until, status
  ) VALUES (
    v_session_id, v_enrollment_id, v_participant_id,
    v_valid_from, v_valid_until, 'active'
  )
  RETURNING id, public_token, qr_token
  INTO v_pass_id, v_public_token, v_qr_token;

  INSERT INTO assessment_leads (
    slot_id, enrollment_id, participant_id, child_age, status, source
  ) VALUES (
    p_slot_id, v_enrollment_id, v_participant_id, p_child_age, 'registered_assessment', v_source
  );

  UPDATE assessment_slots
  SET enrolled_count = enrolled_count + 1
  WHERE id = p_slot_id;

  RETURN json_build_object(
    'result', 'ok',
    'public_token', v_public_token,
    'qr_token', v_qr_token,
    'child_name', v_child_name,
    'session_date', v_slot.slot_date,
    'start_time', v_slot.start_time
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('result', 'duplicate_enrollment');
END;
$$;

REVOKE ALL ON FUNCTION public.register_assessment(uuid, text, integer, text, text, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_assessment(uuid, text, integer, text, text, text, text, text, date) TO anon, authenticated;

-- ── 10. create_assessment_lead — gender, grade, birth_date ───
DROP FUNCTION IF EXISTS public.create_assessment_lead(text, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_assessment_lead(
  p_phone text,
  p_child_name text,
  p_parent_name text DEFAULT NULL,
  p_source text DEFAULT 'website',
  p_notes text DEFAULT NULL,
  p_child_age integer DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_birth_date date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_child_name text;
  v_family_id uuid;
  v_participant_id uuid;
  v_lead_id uuid;
  v_birth_date date;
  v_source text;
  v_gender text;
  v_grade text;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));
  v_source := public.normalize_lead_source(p_source);
  v_gender := NULLIF(lower(trim(COALESCE(p_gender, ''))), '');
  v_grade := NULLIF(trim(COALESCE(p_grade, '')), '');

  IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female') THEN
    RETURN json_build_object('result', 'invalid_gender');
  END IF;

  IF v_phone = '' OR v_child_name = '' THEN
    RETURN json_build_object('result', 'invalid_input');
  END IF;

  SELECT id INTO v_family_id FROM families WHERE phone = v_phone;

  IF v_family_id IS NULL THEN
    INSERT INTO families (phone, parent_name)
    VALUES (v_phone, NULLIF(trim(COALESCE(p_parent_name, '')), ''))
    RETURNING id INTO v_family_id;
  ELSIF p_parent_name IS NOT NULL AND trim(p_parent_name) <> '' THEN
    UPDATE families SET parent_name = trim(p_parent_name) WHERE id = v_family_id;
  END IF;

  v_birth_date := p_birth_date;
  IF v_birth_date IS NULL AND p_child_age IS NOT NULL AND p_child_age > 0 AND p_child_age < 120 THEN
    v_birth_date := (CURRENT_DATE - (p_child_age * interval '1 year'))::date;
  END IF;

  SELECT id INTO v_participant_id
  FROM participants
  WHERE family_id = v_family_id
    AND lower(trim(full_name)) = lower(v_child_name);

  IF v_participant_id IS NULL THEN
    INSERT INTO participants (family_id, full_name, birth_date, gender, grade)
    VALUES (v_family_id, v_child_name, v_birth_date, v_gender, v_grade)
    RETURNING id INTO v_participant_id;
  ELSE
    UPDATE participants SET
      birth_date = COALESCE(v_birth_date, birth_date),
      gender = COALESCE(v_gender, gender),
      grade = COALESCE(v_grade, grade)
    WHERE id = v_participant_id;
  END IF;

  INSERT INTO assessment_leads (
    participant_id, child_age, status, source, notes
  ) VALUES (
    v_participant_id, p_child_age, 'new', v_source, NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_lead_id;

  RETURN json_build_object('result', 'ok', 'lead_id', v_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_assessment_lead(text, text, text, text, text, integer, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_assessment_lead(text, text, text, text, text, integer, text, text, date) TO authenticated;

SELECT 'Command Center foundation migration complete' AS status;
