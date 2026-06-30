-- ============================================================
--  MIGRATION: Stream Line OS — שלב 3 (ימים 8–9)
--  מבדק שחייה: לידים, RPC הרשמה ציבורית, sync מפגשים
-- ============================================================

ALTER TABLE assessment_slots
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES scheduled_sessions(id);

CREATE TABLE IF NOT EXISTS assessment_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         UUID NOT NULL REFERENCES assessment_slots(id) ON DELETE CASCADE,
  enrollment_id   UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  participant_id  UUID REFERENCES participants(id) ON DELETE SET NULL,
  child_age       INTEGER,
  status          TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'converted', 'cancelled')),
  source          TEXT NOT NULL DEFAULT 'web',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assessment_leads_slot_id_idx ON assessment_leads (slot_id);
CREATE INDEX IF NOT EXISTS assessment_leads_status_idx ON assessment_leads (status);

ALTER TABLE assessment_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read assessment leads"
  ON assessment_leads FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin manage assessment leads"
  ON assessment_leads FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── מוצר מבדק לעונה הפעילה ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_assessment_product()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid;
  v_template_id uuid;
  v_product_id uuid;
BEGIN
  SELECT id INTO v_season_id
  FROM seasons
  WHERE active = TRUE
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'no_active_season';
  END IF;

  SELECT id INTO v_template_id
  FROM product_templates
  WHERE code = 'swim_assessment';

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'swim_assessment_template_missing';
  END IF;

  SELECT id INTO v_product_id
  FROM products
  WHERE season_id = v_season_id
    AND template_id = v_template_id
  LIMIT 1;

  IF v_product_id IS NOT NULL THEN
    RETURN v_product_id;
  END IF;

  INSERT INTO products (
    season_id, template_id, name,
    day_of_week, start_time, end_time, instructor_name
  ) VALUES (
    v_season_id, v_template_id, 'מבדק שחייה',
    NULL, '16:00', '16:30', 'מבדק'
  )
  RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_assessment_product() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_assessment_product() TO authenticated;

-- ── יצירת מפגש למועד מבדק ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_assessment_slot_session(p_slot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_product_id uuid;
  v_session_id uuid;
  v_end_time time;
BEGIN
  SELECT * INTO v_slot
  FROM assessment_slots
  WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found';
  END IF;

  IF v_slot.session_id IS NOT NULL THEN
    RETURN v_slot.session_id;
  END IF;

  v_product_id := public.ensure_assessment_product();
  v_end_time := (v_slot.start_time + interval '30 minutes')::time;

  INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
  VALUES (v_product_id, v_slot.slot_date, v_slot.start_time, v_end_time)
  ON CONFLICT (product_id, session_date) DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM scheduled_sessions
    WHERE product_id = v_product_id
      AND session_date = v_slot.slot_date;
  END IF;

  UPDATE assessment_slots
  SET session_id = v_session_id
  WHERE id = p_slot_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_assessment_slot_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_assessment_slot_session(uuid) TO authenticated;

-- ── רשימת מועדים פנויים (ציבורי) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.list_assessment_slots()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.slot_date, t.start_time)
      FROM (
        SELECT
          id,
          slot_date,
          start_time,
          capacity,
          enrolled_count,
          (capacity - enrolled_count) AS spots_left
        FROM assessment_slots
        WHERE active = TRUE
          AND slot_date >= CURRENT_DATE
          AND enrolled_count < capacity
        ORDER BY slot_date, start_time
      ) t
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_assessment_slots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assessment_slots() TO anon, authenticated;

-- ── הרשמה למבדק (ציבורי) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_assessment(
  p_slot_id uuid,
  p_child_name text,
  p_child_age integer,
  p_parent_name text,
  p_phone text
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
BEGIN
  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));

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

  IF p_child_age IS NOT NULL AND p_child_age > 0 AND p_child_age < 120 THEN
    v_birth_date := (CURRENT_DATE - (p_child_age * interval '1 year'))::date;
  END IF;

  SELECT id INTO v_participant_id
  FROM participants
  WHERE family_id = v_family_id
    AND lower(trim(full_name)) = lower(v_child_name);

  IF v_participant_id IS NULL THEN
    INSERT INTO participants (family_id, full_name, birth_date)
    VALUES (v_family_id, v_child_name, v_birth_date)
    RETURNING id INTO v_participant_id;
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
    p_slot_id, v_enrollment_id, v_participant_id, p_child_age, 'new', 'web'
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

REVOKE ALL ON FUNCTION public.register_assessment(uuid, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_assessment(uuid, text, integer, text, text) TO anon, authenticated;

SELECT 'Stream Line OS stage 3 migration complete' AS status;
