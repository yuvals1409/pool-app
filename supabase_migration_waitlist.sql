-- ============================================================
--  Stream Line OS — Waitlist
--  רשימת המתנה למבדק, קיץ וחוג + הצעות הרשמה
-- ============================================================

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID REFERENCES families(id) ON DELETE SET NULL,
  participant_id    UUID REFERENCES participants(id) ON DELETE SET NULL,
  target_type       TEXT NOT NULL CHECK (target_type IN ('assessment_slot', 'product')),
  target_id         UUID NOT NULL,
  position          INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'notified', 'promoted', 'expired', 'cancelled')),
  phone             TEXT NOT NULL,
  parent_name       TEXT,
  child_name        TEXT NOT NULL,
  child_age         INTEGER,
  summer_invite_token UUID,
  offer_token       UUID UNIQUE,
  offer_expires_at  TIMESTAMPTZ,
  notified_at       TIMESTAMPTZ,
  promoted_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS waitlist_entries_target_idx
  ON waitlist_entries (target_type, target_id, status, position);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_active_participant_idx
  ON waitlist_entries (participant_id, target_type, target_id)
  WHERE status IN ('waiting', 'notified');

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_active_phone_slot_idx
  ON waitlist_entries (phone, target_type, target_id)
  WHERE status IN ('waiting', 'notified') AND target_type = 'assessment_slot';

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read waitlist"
  ON waitlist_entries FOR SELECT
  USING (public.is_admin_or_office());

CREATE POLICY "admin manage waitlist"
  ON waitlist_entries FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ── helper: next position in queue ───────────────────────────
CREATE OR REPLACE FUNCTION public.waitlist_next_position(
  p_target_type text,
  p_target_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(MAX(position), 0) + 1
  FROM waitlist_entries
  WHERE target_type = p_target_type
    AND target_id = p_target_id
    AND status IN ('waiting', 'notified');
$$;

-- ── helper: is target full? ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_target_full(
  p_target_type text,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_product record;
  v_enrolled integer;
BEGIN
  IF p_target_type = 'assessment_slot' THEN
    SELECT * INTO v_slot FROM assessment_slots WHERE id = p_target_id;
    IF NOT FOUND THEN RETURN TRUE; END IF;
    RETURN v_slot.enrolled_count >= v_slot.capacity;
  END IF;

  IF p_target_type = 'product' THEN
    SELECT * INTO v_product FROM products WHERE id = p_target_id;
    IF NOT FOUND OR v_product.capacity IS NULL THEN RETURN FALSE; END IF;
    SELECT COUNT(*) INTO v_enrolled
    FROM enrollments WHERE product_id = p_target_id AND active = TRUE;
    RETURN v_enrolled >= v_product.capacity;
  END IF;

  RETURN TRUE;
END;
$$;

-- ── helper: has available spot (not full)? ───────────────────
CREATE OR REPLACE FUNCTION public.target_has_spot(
  p_target_type text,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOT public.is_target_full(p_target_type, p_target_id);
$$;

-- ── expire stale offers ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_waitlist_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id, target_type, target_id
    FROM waitlist_entries
    WHERE status = 'notified'
      AND offer_expires_at IS NOT NULL
      AND offer_expires_at < NOW()
  LOOP
    UPDATE waitlist_entries
    SET status = 'expired', offer_token = NULL
    WHERE id = r.id;
    v_count := v_count + 1;
    PERFORM public.try_promote_waitlist(r.target_type, r.target_id);
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── promote first waiting entry ──────────────────────────────
CREATE OR REPLACE FUNCTION public.try_promote_waitlist(
  p_target_type text,
  p_target_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry record;
  v_token uuid;
BEGIN
  PERFORM public.expire_stale_waitlist_offers();

  IF NOT public.target_has_spot(p_target_type, p_target_id) THEN
    RETURN json_build_object('result', 'still_full');
  END IF;

  IF EXISTS (
    SELECT 1 FROM waitlist_entries
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND status = 'notified'
      AND offer_expires_at > NOW()
  ) THEN
    RETURN json_build_object('result', 'offer_pending');
  END IF;

  SELECT * INTO v_entry
  FROM waitlist_entries
  WHERE target_type = p_target_type
    AND target_id = p_target_id
    AND status = 'waiting'
  ORDER BY position, created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'empty');
  END IF;

  v_token := gen_random_uuid();

  UPDATE waitlist_entries
  SET status = 'notified',
      offer_token = v_token,
      offer_expires_at = NOW() + interval '48 hours'
  WHERE id = v_entry.id;

  RETURN json_build_object(
    'result', 'promoted',
    'entry_id', v_entry.id,
    'offer_token', v_token,
    'phone', v_entry.phone,
    'child_name', v_entry.child_name,
    'target_type', p_target_type,
    'target_id', p_target_id
  );
END;
$$;

-- ── join waitlist (public / admin) ───────────────────────────
CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_target_type text,
  p_target_id uuid,
  p_child_name text,
  p_phone text,
  p_parent_name text DEFAULT NULL,
  p_child_age integer DEFAULT NULL,
  p_summer_invite_token uuid DEFAULT NULL
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
  v_birth_date date;
  v_position integer;
  v_entry_id uuid;
  v_invite record;
  v_slot record;
  v_product record;
BEGIN
  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));

  IF p_target_type NOT IN ('assessment_slot', 'product') THEN
    RETURN json_build_object('result', 'invalid_target');
  END IF;

  IF p_target_type = 'assessment_slot' THEN
    SELECT * INTO v_slot FROM assessment_slots WHERE id = p_target_id;
    IF NOT FOUND OR NOT v_slot.active OR v_slot.slot_date < CURRENT_DATE THEN
      RETURN json_build_object('result', 'target_unavailable');
    END IF;
    IF v_slot.enrolled_count < v_slot.capacity THEN
      RETURN json_build_object('result', 'not_full');
    END IF;
  END IF;

  IF p_target_type = 'product' THEN
    SELECT * INTO v_product FROM products WHERE id = p_target_id;
    IF NOT FOUND THEN
      RETURN json_build_object('result', 'target_unavailable');
    END IF;
    IF NOT public.is_target_full('product', p_target_id) THEN
      RETURN json_build_object('result', 'not_full');
    END IF;
  END IF;

  IF p_summer_invite_token IS NOT NULL THEN
    SELECT si.*, al.participant_id AS lead_participant_id, al.status AS lead_status
    INTO v_invite
    FROM summer_invitations si
    JOIN assessment_leads al ON al.id = si.assessment_lead_id
    WHERE si.token = p_summer_invite_token;

    IF NOT FOUND OR v_invite.used_at IS NOT NULL OR v_invite.expires_at < NOW()
       OR v_invite.lead_status = 'abandoned' THEN
      RETURN json_build_object('result', 'invite_invalid');
    END IF;

    v_participant_id := v_invite.lead_participant_id;
    SELECT f.id, f.phone, f.parent_name, p.full_name
    INTO v_family_id, v_phone, p_parent_name, v_child_name
    FROM participants p
    JOIN families f ON f.id = p.family_id
    WHERE p.id = v_participant_id;
  ELSE
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
  END IF;

  IF EXISTS (
    SELECT 1 FROM waitlist_entries
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND participant_id = v_participant_id
      AND status IN ('waiting', 'notified')
  ) THEN
    RETURN json_build_object('result', 'already_on_waitlist');
  END IF;

  v_position := public.waitlist_next_position(p_target_type, p_target_id);

  INSERT INTO waitlist_entries (
    family_id, participant_id, target_type, target_id, position,
    phone, parent_name, child_name, child_age, summer_invite_token
  ) VALUES (
    v_family_id, v_participant_id, p_target_type, p_target_id, v_position,
    v_phone, NULLIF(trim(COALESCE(p_parent_name, '')), ''),
    v_child_name, p_child_age, p_summer_invite_token
  )
  RETURNING id INTO v_entry_id;

  RETURN json_build_object(
    'result', 'ok',
    'entry_id', v_entry_id,
    'position', v_position
  );
END;
$$;

-- ── leave waitlist ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leave_waitlist(p_entry_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE waitlist_entries
  SET status = 'cancelled'
  WHERE id = p_entry_id
    AND status IN ('waiting', 'notified');

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── list waitlist (admin) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_waitlist(
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.target_type, t.target_id, t.position)
      FROM (
        SELECT
          w.id,
          w.target_type,
          w.target_id,
          w.position,
          w.status,
          w.phone,
          w.parent_name,
          w.child_name,
          w.child_age,
          w.offer_token,
          w.offer_expires_at,
          w.notified_at,
          w.promoted_at,
          w.created_at,
          CASE
            WHEN w.target_type = 'assessment_slot' THEN
              (SELECT slot_date::text || ' ' || start_time::text FROM assessment_slots WHERE id = w.target_id)
            WHEN w.target_type = 'product' THEN
              (SELECT name FROM products WHERE id = w.target_id)
          END AS target_label
        FROM waitlist_entries w
        WHERE w.status IN ('waiting', 'notified')
          AND (p_target_type IS NULL OR w.target_type = p_target_type)
          AND (p_target_id IS NULL OR w.target_id = p_target_id)
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── pending notifications (admin) ────────────────────────────
CREATE OR REPLACE FUNCTION public.list_pending_waitlist_notifications()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at)
      FROM (
        SELECT
          w.id,
          w.target_type,
          w.target_id,
          w.phone,
          w.parent_name,
          w.child_name,
          w.offer_token,
          w.offer_expires_at,
          w.notified_at,
          w.created_at,
          CASE
            WHEN w.target_type = 'assessment_slot' THEN 'assessment'
            ELSE 'summer'
          END AS register_path,
          CASE
            WHEN w.target_type = 'assessment_slot' THEN
              (SELECT slot_date FROM assessment_slots WHERE id = w.target_id)
            ELSE NULL
          END AS slot_date,
          CASE
            WHEN w.target_type = 'product' THEN
              (SELECT name FROM products WHERE id = w.target_id)
            ELSE NULL
          END AS product_name
        FROM waitlist_entries w
        WHERE w.status = 'notified'
          AND w.offer_expires_at > NOW()
          AND w.notified_at IS NULL
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── mark notified ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_waitlist_notified(p_entry_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  UPDATE waitlist_entries
  SET notified_at = NOW()
  WHERE id = p_entry_id AND status = 'notified';

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── get waitlist offer (public) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_waitlist_offer(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_entry record;
BEGIN
  SELECT * INTO v_entry
  FROM waitlist_entries
  WHERE offer_token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_entry.status NOT IN ('notified', 'promoted') THEN
    RETURN json_build_object('result', 'invalid');
  END IF;

  IF v_entry.offer_expires_at < NOW() AND v_entry.status <> 'promoted' THEN
    RETURN json_build_object('result', 'expired');
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'target_type', v_entry.target_type,
    'target_id', v_entry.target_id,
    'child_name', v_entry.child_name,
    'parent_name', v_entry.parent_name,
    'phone', v_entry.phone,
    'child_age', v_entry.child_age,
    'summer_invite_token', v_entry.summer_invite_token,
    'already_promoted', v_entry.status = 'promoted'
  );
END;
$$;

-- ── register from waitlist offer ───────────────────────────────
CREATE OR REPLACE FUNCTION public.register_from_waitlist_offer(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry record;
  v_slot record;
  v_product record;
  v_product_id uuid;
  v_session_id uuid;
  v_enrollment_id uuid;
  v_public_token uuid;
  v_qr_token uuid;
  v_template record;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_pattern jsonb;
  v_enrolled integer;
  v_assessment_data json;
BEGIN
  SELECT * INTO v_entry
  FROM waitlist_entries
  WHERE offer_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_entry.status = 'promoted' THEN
    RETURN json_build_object('result', 'already_used');
  END IF;

  IF v_entry.status <> 'notified' OR v_entry.offer_expires_at < NOW() THEN
    RETURN json_build_object('result', 'expired');
  END IF;

  IF NOT public.target_has_spot(v_entry.target_type, v_entry.target_id) THEN
    RETURN json_build_object('result', 'spot_taken');
  END IF;

  IF v_entry.target_type = 'assessment_slot' THEN
    SELECT * INTO v_slot FROM assessment_slots WHERE id = v_entry.target_id FOR UPDATE;

    IF NOT v_slot.active OR v_slot.slot_date < CURRENT_DATE THEN
      RETURN json_build_object('result', 'target_unavailable');
    END IF;

    IF v_slot.enrolled_count >= v_slot.capacity THEN
      RETURN json_build_object('result', 'slot_full');
    END IF;

    v_product_id := public.ensure_assessment_product();

    IF v_slot.session_id IS NULL THEN
      v_session_id := public.sync_assessment_slot_session(v_entry.target_id);
    ELSE
      v_session_id := v_slot.session_id;
    END IF;

    SELECT * INTO v_template FROM product_templates WHERE code = 'swim_assessment';

    IF EXISTS (
      SELECT 1 FROM enrollments
      WHERE participant_id = v_entry.participant_id
        AND product_id = v_product_id AND active = TRUE
    ) THEN
      RETURN json_build_object('result', 'duplicate_enrollment');
    END IF;

    INSERT INTO enrollments (
      product_id, participant_id, payment_status,
      valid_from, valid_until, active
    ) VALUES (
      v_product_id, v_entry.participant_id, 'waived',
      v_slot.slot_date, v_slot.slot_date, TRUE
    )
    RETURNING id INTO v_enrollment_id;

    INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
    VALUES (v_session_id, v_enrollment_id, v_entry.participant_id)
    ON CONFLICT (session_id, enrollment_id) DO NOTHING;

    v_valid_from := (v_slot.slot_date + v_slot.start_time)
      - make_interval(mins => COALESCE(v_template.entry_window_before_minutes, 30));
    v_valid_until := (v_slot.slot_date + v_slot.start_time)
      + make_interval(mins => COALESCE(v_template.duration_minutes, 30)
        + COALESCE(v_template.entry_window_after_minutes, 30));

    INSERT INTO access_passes (
      session_id, enrollment_id, participant_id,
      valid_from, valid_until, status
    ) VALUES (
      v_session_id, v_enrollment_id, v_entry.participant_id,
      v_valid_from, v_valid_until, 'active'
    )
    RETURNING public_token, qr_token INTO v_public_token, v_qr_token;

    INSERT INTO assessment_leads (
      slot_id, enrollment_id, participant_id, child_age, status, source
    ) VALUES (
      v_entry.target_id, v_enrollment_id, v_entry.participant_id,
      v_entry.child_age, 'registered_assessment', 'website'
    );

    UPDATE assessment_slots
    SET enrolled_count = enrolled_count + 1
    WHERE id = v_entry.target_id;

    UPDATE waitlist_entries
    SET status = 'promoted', promoted_at = NOW()
    WHERE id = v_entry.id;

    RETURN json_build_object(
      'result', 'ok',
      'type', 'assessment',
      'public_token', v_public_token,
      'qr_token', v_qr_token,
      'child_name', v_entry.child_name,
      'session_date', v_slot.slot_date,
      'start_time', v_slot.start_time
    );
  END IF;

  IF v_entry.target_type = 'product' THEN
    IF v_entry.summer_invite_token IS NULL THEN
      RETURN json_build_object('result', 'invalid_offer');
    END IF;

    SELECT p.*, pt.code AS template_code
    INTO v_product
    FROM products p
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE p.id = v_entry.target_id;

    IF NOT FOUND OR v_product.template_code <> 'summer_course' THEN
      RETURN json_build_object('result', 'invalid_product');
    END IF;

    SELECT COUNT(*) INTO v_enrolled
    FROM enrollments WHERE product_id = v_entry.target_id AND active = TRUE;

    IF v_product.capacity IS NOT NULL AND v_enrolled >= v_product.capacity THEN
      RETURN json_build_object('result', 'course_full');
    END IF;

    v_pattern := public.effective_schedule_pattern(v_entry.target_id);

    IF EXISTS (
      SELECT 1 FROM enrollments
      WHERE participant_id = v_entry.participant_id
        AND product_id = v_entry.target_id AND active = TRUE
    ) THEN
      RETURN json_build_object('result', 'duplicate_enrollment');
    END IF;

    INSERT INTO enrollments (
      product_id, participant_id, payment_status,
      valid_from, valid_until, active
    ) VALUES (
      v_entry.target_id,
      v_entry.participant_id,
      'unpaid',
      COALESCE((v_pattern->>'course_start')::date, CURRENT_DATE),
      COALESCE((v_pattern->>'course_end')::date, CURRENT_DATE + 60),
      TRUE
    )
    RETURNING id INTO v_enrollment_id;

    PERFORM public.generate_course_series_sessions(v_entry.target_id);
    PERFORM public.generate_access_passes(
      CURRENT_DATE,
      COALESCE((v_pattern->>'course_end')::date, CURRENT_DATE + 60)
    );

    SELECT ap.public_token INTO v_public_token
    FROM access_passes ap
    JOIN scheduled_sessions ss ON ss.id = ap.session_id
    WHERE ap.enrollment_id = v_enrollment_id
      AND ap.status = 'active'
      AND ss.session_date >= CURRENT_DATE
    ORDER BY ss.session_date, ss.start_time
    LIMIT 1;

    UPDATE summer_invitations
    SET used_at = NOW(), enrollment_id = v_enrollment_id
    WHERE token = v_entry.summer_invite_token AND used_at IS NULL;

    UPDATE waitlist_entries
    SET status = 'promoted', promoted_at = NOW()
    WHERE id = v_entry.id;

    RETURN json_build_object(
      'result', 'ok',
      'type', 'summer',
      'public_token', v_public_token,
      'child_name', v_entry.child_name
    );
  END IF;

  RETURN json_build_object('result', 'invalid_target');
END;
$$;

-- ── cancel enrollment + promote waitlist ─────────────────────
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

  UPDATE enrollments SET active = FALSE WHERE id = p_enrollment_id;

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

-- ── updated list_assessment_slots (include full) ─────────────
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
          GREATEST(capacity - enrolled_count, 0) AS spots_left,
          (enrolled_count >= capacity) AS is_full
        FROM assessment_slots
        WHERE active = TRUE
          AND slot_date >= CURRENT_DATE
        ORDER BY slot_date, start_time
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── updated get_summer_invite (include full courses) ─────────
CREATE OR REPLACE FUNCTION public.get_summer_invite(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_child record;
  v_season_id uuid;
BEGIN
  SELECT si.*, al.status AS lead_status
  INTO v_invite
  FROM summer_invitations si
  JOIN assessment_leads al ON al.id = si.assessment_lead_id
  WHERE si.token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RETURN json_build_object('result', 'already_used');
  END IF;

  IF v_invite.expires_at < NOW() THEN
    RETURN json_build_object('result', 'expired');
  END IF;

  IF v_invite.lead_status = 'abandoned' THEN
    RETURN json_build_object('result', 'cancelled');
  END IF;

  SELECT p.full_name, f.phone, f.parent_name
  INTO v_child
  FROM participants p
  JOIN families f ON f.id = p.family_id
  WHERE p.id = v_invite.participant_id;

  SELECT id INTO v_season_id
  FROM seasons
  WHERE name ILIKE '%קיץ%'
  ORDER BY active DESC, start_date DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id
    FROM seasons
    WHERE active = TRUE
    ORDER BY start_date DESC
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'child_name', v_child.full_name,
    'parent_phone', v_child.phone,
    'parent_name', v_child.parent_name,
    'courses', COALESCE(
      (
        SELECT json_agg(row_to_json(c) ORDER BY c.name)
        FROM (
          SELECT
            p.id,
            p.name,
            p.start_time,
            p.end_time,
            p.instructor_name,
            p.capacity,
            COALESCE(enr.cnt, 0) AS enrolled_count,
            CASE
              WHEN p.capacity IS NOT NULL AND COALESCE(enr.cnt, 0) >= p.capacity THEN 0
              ELSE COALESCE(p.capacity, 9999) - COALESCE(enr.cnt, 0)
            END AS spots_left,
            (p.capacity IS NOT NULL AND COALESCE(enr.cnt, 0) >= p.capacity) AS is_full
          FROM products p
          JOIN product_templates pt ON pt.id = p.template_id
          LEFT JOIN (
            SELECT product_id, COUNT(*) AS cnt
            FROM enrollments
            WHERE active = TRUE
            GROUP BY product_id
          ) enr ON enr.product_id = p.id
          WHERE p.season_id = v_season_id
            AND pt.code = 'summer_course'
        ) c
      ),
      '[]'::json
    )
  );
END;
$$;

-- ── updated update_lead_crm — promote waitlist on abandon ────
CREATE OR REPLACE FUNCTION public.update_lead_crm(
  p_lead_id uuid,
  p_status text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_slot record;
  v_product_id uuid;
  v_session_id uuid;
  v_enrollment_id uuid;
  v_template record;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_slot_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_lead FROM assessment_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN (
    'new', 'call', 'registered_assessment', 'passed', 'registered_class', 'abandoned'
  ) THEN
    RETURN json_build_object('result', 'invalid_status');
  END IF;

  IF p_slot_id IS NOT NULL AND v_lead.slot_id IS NULL AND v_lead.participant_id IS NOT NULL THEN
    SELECT * INTO v_slot FROM assessment_slots WHERE id = p_slot_id FOR UPDATE;
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

    SELECT * INTO v_template FROM product_templates WHERE code = 'swim_assessment';

    IF v_lead.enrollment_id IS NULL THEN
      INSERT INTO enrollments (
        product_id, participant_id, payment_status,
        valid_from, valid_until, active
      ) VALUES (
        v_product_id, v_lead.participant_id, 'waived',
        v_slot.slot_date, v_slot.slot_date, TRUE
      )
      RETURNING id INTO v_enrollment_id;

      INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
      VALUES (v_session_id, v_enrollment_id, v_lead.participant_id)
      ON CONFLICT (session_id, enrollment_id) DO NOTHING;

      SELECT ss.start_time INTO v_slot.start_time
      FROM scheduled_sessions ss WHERE ss.id = v_session_id;

      v_valid_from := (v_slot.slot_date + v_slot.start_time)
        - make_interval(mins => COALESCE(v_template.entry_window_before_minutes, 30));
      v_valid_until := (v_slot.slot_date + v_slot.start_time)
        + make_interval(mins => COALESCE(v_template.duration_minutes, 30)
          + COALESCE(v_template.entry_window_after_minutes, 30));

      INSERT INTO access_passes (
        session_id, enrollment_id, participant_id,
        valid_from, valid_until, status
      ) VALUES (
        v_session_id, v_enrollment_id, v_lead.participant_id,
        v_valid_from, v_valid_until, 'active'
      );

      UPDATE assessment_slots SET enrolled_count = enrolled_count + 1 WHERE id = p_slot_id;

      UPDATE assessment_leads SET
        slot_id = p_slot_id,
        enrollment_id = v_enrollment_id,
        status = 'registered_assessment'
      WHERE id = p_lead_id;
    ELSE
      UPDATE assessment_leads SET slot_id = p_slot_id WHERE id = p_lead_id;
    END IF;
  END IF;

  UPDATE assessment_leads SET
    status = COALESCE(p_status, status),
    source = CASE WHEN p_source IS NOT NULL THEN public.normalize_lead_source(p_source) ELSE source END,
    notes = CASE WHEN p_notes IS NOT NULL THEN NULLIF(trim(p_notes), '') ELSE notes END
  WHERE id = p_lead_id;

  IF p_status = 'abandoned' AND v_lead.enrollment_id IS NOT NULL THEN
    UPDATE enrollments SET active = FALSE WHERE id = v_lead.enrollment_id AND active = TRUE;
    UPDATE access_passes SET status = 'cancelled'
      WHERE enrollment_id = v_lead.enrollment_id AND status = 'active';
    v_slot_id := COALESCE(v_lead.slot_id, p_slot_id);
    IF v_slot_id IS NOT NULL THEN
      UPDATE assessment_slots SET enrolled_count = GREATEST(enrolled_count - 1, 0)
        WHERE id = v_slot_id;
      PERFORM public.try_promote_waitlist('assessment_slot', v_slot_id);
    END IF;
  END IF;

  RETURN json_build_object('result', 'ok', 'lead_id', p_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.join_waitlist(text, uuid, text, text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waitlist(text, uuid, text, text, text, integer, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.leave_waitlist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_waitlist(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_waitlist(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_waitlist(text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pending_waitlist_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_waitlist_notifications() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_waitlist_notified(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_waitlist_notified(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_waitlist_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_waitlist_offer(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.register_from_waitlist_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_from_waitlist_offer(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_enrollment(uuid) TO authenticated;

SELECT 'Waitlist migration complete' AS status;
