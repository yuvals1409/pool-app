-- ============================================================
--  Child entry portal — permanent link + PIN per participant
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Config (PIN encryption secret) ──────────────────────────
CREATE TABLE IF NOT EXISTS portal_config (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pin_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')
);

INSERT INTO portal_config (id, pin_secret)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.portal_pin_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pin_secret FROM portal_config WHERE id = 1;
$$;

-- ── Schema: participants ────────────────────────────────────
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS portal_token UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_pin_enc TEXT,
  ADD COLUMN IF NOT EXISTS portal_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portal_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_photo_data BYTEA,
  ADD COLUMN IF NOT EXISTS portal_photo_mime TEXT,
  ADD COLUMN IF NOT EXISTS photo_uploaded_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS participants_portal_token_idx
  ON participants (portal_token)
  WHERE portal_token IS NOT NULL;

-- ── Schema: lessons ─────────────────────────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lessons_participant_id_idx ON lessons (participant_id);

-- ── Portal sessions (anon dashboard auth) ───────────────────
CREATE TABLE IF NOT EXISTS portal_sessions (
  nonce           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_sessions_participant_idx
  ON portal_sessions (participant_id, expires_at DESC);

-- ── Audit log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID REFERENCES participants(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_config ENABLE ROW LEVEL SECURITY;

-- ── Staff helpers ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff_portal_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role IN ('admin', 'office', 'instructor')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_portal_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role IN ('admin', 'office')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_photo_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff_portal_viewer();
$$;

-- ── PIN helpers ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_portal_pin()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_pin text;
BEGIN
  LOOP
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN v_pin <> '000000';
  END LOOP;
  RETURN v_pin;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_encrypt_pin(p_pin text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.pgp_sym_encrypt(p_pin, public.portal_pin_secret()), 'base64');
$$;

CREATE OR REPLACE FUNCTION public.portal_decrypt_pin(p_enc text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_decrypt(decode(p_enc, 'base64'), public.portal_pin_secret());
$$;

CREATE OR REPLACE FUNCTION public.portal_photo_data_url(p_data bytea, p_mime text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_data IS NULL THEN NULL
    ELSE 'data:' || COALESCE(NULLIF(p_mime, ''), 'image/jpeg') || ';base64,' || encode(p_data, 'base64')
  END;
$$;

CREATE OR REPLACE FUNCTION public.portal_season_expires_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (end_date::timestamptz + INTERVAL '1 day' - INTERVAL '1 second')
      FROM seasons
      WHERE active = TRUE
      ORDER BY end_date DESC
      LIMIT 1
    ),
    (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 second')
  );
$$;

-- ── Validate portal session ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_validate_session(p_token uuid, p_nonce uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
BEGIN
  SELECT p.id INTO v_participant_id
  FROM participants p
  WHERE p.portal_token = p_token;

  IF v_participant_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM portal_sessions ps
    WHERE ps.nonce = p_nonce
      AND ps.participant_id = v_participant_id
      AND ps.expires_at > NOW()
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v_participant_id;
END;
$$;

-- ── ensure_participant_portal ───────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_participant_portal(p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row participants%ROWTYPE;
  v_pin text;
BEGIN
  SELECT * INTO v_row FROM participants WHERE id = p_participant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_row.portal_token IS NULL THEN
    v_pin := public.generate_portal_pin();
    UPDATE participants
    SET
      portal_token = gen_random_uuid(),
      portal_pin_enc = public.portal_encrypt_pin(v_pin),
      portal_failed_attempts = 0,
      portal_locked_at = NULL
    WHERE id = p_participant_id
    RETURNING * INTO v_row;
  ELSE
    v_pin := public.portal_decrypt_pin(v_row.portal_pin_enc);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'participant_id', v_row.id,
    'portal_token', v_row.portal_token,
    'portal_pin', v_pin
  );
END;
$$;

-- ── Upcoming entry (pass or private lesson) ─────────────────
CREATE OR REPLACE FUNCTION public.get_portal_upcoming_entry(p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := NOW();
  v_pass record;
  v_lesson record;
  v_pass_ts timestamptz;
  v_lesson_ts timestamptz;
  v_blocked text;
  v_entry_type text;
  v_qr_token uuid;
  v_child_name text;
  v_session_date date;
  v_start_time time;
  v_end_time time;
  v_product_name text;
  v_instructor_name text;
BEGIN
  SELECT p.full_name INTO v_child_name FROM participants p WHERE p.id = p_participant_id;

  SELECT
    ap.qr_token,
    ap.status AS pass_status,
    ap.valid_from,
    ap.valid_until,
    ap.used_at,
    ss.session_date,
    ss.start_time,
    ss.end_time,
    ss.status AS session_status,
    pr.name AS product_name,
    pr.instructor_name,
    e.payment_status,
    e.active AS enrollment_active,
    s.active AS season_active
  INTO v_pass
  FROM access_passes ap
  JOIN scheduled_sessions ss ON ss.id = ap.session_id
  JOIN products pr ON pr.id = ss.product_id
  JOIN seasons s ON s.id = pr.season_id
  JOIN enrollments e ON e.id = ap.enrollment_id
  WHERE ap.participant_id = p_participant_id
    AND ap.status = 'active'
    AND ss.session_date >= CURRENT_DATE
    AND ss.status <> 'cancelled'
  ORDER BY ss.session_date, ss.start_time
  LIMIT 1;

  SELECT
    l.id,
    l.qr_token,
    l.lesson_date,
    l.start_time,
    l.end_time,
    l.instructor_name,
    l.used,
    l.cancelled,
    l.payment_status
  INTO v_lesson
  FROM lessons l
  WHERE l.participant_id = p_participant_id
    AND l.used = FALSE
    AND l.cancelled = FALSE
    AND l.lesson_date >= CURRENT_DATE
  ORDER BY l.lesson_date, l.start_time
  LIMIT 1;

  v_pass_ts := NULL;
  v_lesson_ts := NULL;
  IF v_pass.qr_token IS NOT NULL THEN
    v_pass_ts := v_pass.session_date::timestamptz + v_pass.start_time;
  END IF;
  IF v_lesson.qr_token IS NOT NULL THEN
    v_lesson_ts := v_lesson.lesson_date::timestamptz + v_lesson.start_time;
  END IF;

  IF v_pass_ts IS NULL AND v_lesson_ts IS NULL THEN
    RETURN json_build_object(
      'result', 'ok',
      'has_entry', FALSE,
      'child_name', v_child_name
    );
  END IF;

  IF v_pass_ts IS NOT NULL AND (v_lesson_ts IS NULL OR v_pass_ts <= v_lesson_ts) THEN
    v_entry_type := 'pass';
    v_qr_token := v_pass.qr_token;
    v_session_date := v_pass.session_date;
    v_start_time := v_pass.start_time;
    v_end_time := v_pass.end_time;
    v_product_name := v_pass.product_name;
    v_instructor_name := v_pass.instructor_name;
    v_blocked := NULL;

    IF NOT v_pass.season_active THEN
      v_blocked := 'season_inactive';
    ELSIF NOT v_pass.enrollment_active THEN
      v_blocked := 'inactive';
    ELSIF v_pass.payment_status = 'unpaid' THEN
      v_blocked := 'unpaid';
    ELSIF v_pass.pass_status = 'used' OR v_pass.used_at IS NOT NULL THEN
      v_blocked := 'already_used';
    ELSIF v_pass.pass_status = 'cancelled' OR v_pass.session_status = 'cancelled' THEN
      v_blocked := 'cancelled';
    ELSIF v_now < v_pass.valid_from THEN
      v_blocked := 'too_early';
    ELSIF v_now > v_pass.valid_until THEN
      v_blocked := 'too_late';
    ELSIF v_pass.pass_status <> 'active' THEN
      v_blocked := 'expired';
    END IF;
  ELSE
    v_entry_type := 'lesson';
    v_qr_token := v_lesson.qr_token;
    v_session_date := v_lesson.lesson_date;
    v_start_time := v_lesson.start_time;
    v_end_time := v_lesson.end_time;
    v_product_name := NULL;
    v_instructor_name := v_lesson.instructor_name;
    v_blocked := NULL;

    IF v_lesson.payment_status = 'unpaid' THEN
      v_blocked := 'unpaid';
    ELSIF v_now < (v_lesson.lesson_date::timestamptz + v_lesson.start_time - INTERVAL '30 minutes') THEN
      v_blocked := 'too_early';
    ELSIF v_now > (v_lesson.lesson_date::timestamptz + v_lesson.start_time + INTERVAL '30 minutes') THEN
      v_blocked := 'too_late';
    END IF;
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'has_entry', TRUE,
    'entry_type', v_entry_type,
    'qr_token', CASE WHEN v_blocked IS NULL THEN v_qr_token ELSE NULL END,
    'blocked_reason', v_blocked,
    'child_name', v_child_name,
    'session_date', v_session_date,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'product_name', v_product_name,
    'instructor_name', v_instructor_name,
    'valid_from', CASE WHEN v_entry_type = 'pass' THEN v_pass.valid_from ELSE NULL END,
    'valid_until', CASE WHEN v_entry_type = 'pass' THEN v_pass.valid_until ELSE NULL END
  );
END;
$$;

-- ── Recent entries ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_portal_recent_entries(p_participant_id uuid, p_limit int DEFAULT 12)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pass_entries AS (
    SELECT
      al.scanned_at AS used_at,
      (al.reason::json)->>'session_date' AS session_date,
      (al.reason::json)->>'start_time' AS start_time,
      (al.reason::json)->>'product_name' AS label,
      (al.reason::json)->>'instructor_name' AS instructor_name,
      'pass'::text AS entry_type
    FROM access_logs al
    JOIN access_passes ap ON ap.id = al.pass_id
    WHERE ap.participant_id = p_participant_id
      AND al.result = 'ok'
  ),
  lesson_entries AS (
    SELECT
      l.used_at,
      l.lesson_date::text AS session_date,
      l.start_time::text AS start_time,
      'שיעור פרטי'::text AS label,
      l.instructor_name,
      'lesson'::text AS entry_type
    FROM lessons l
    WHERE l.participant_id = p_participant_id
      AND l.used = TRUE
      AND l.used_at IS NOT NULL
  ),
  merged AS (
    SELECT * FROM pass_entries
    UNION ALL
    SELECT * FROM lesson_entries
  )
  SELECT COALESCE(
    json_agg(row_to_json(m) ORDER BY m.used_at DESC),
    '[]'::json
  )
  FROM (
    SELECT used_at, session_date, start_time, label, instructor_name, entry_type
    FROM merged
    ORDER BY used_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 12), 20))
  ) m;
$$;

-- ── verify_portal_pin ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_portal_pin(p_token uuid, p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row participants%ROWTYPE;
  v_decrypted text;
  v_nonce uuid;
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_row FROM participants WHERE portal_token = p_token FOR UPDATE;
  IF NOT FOUND OR v_row.portal_pin_enc IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_row.portal_locked_at IS NOT NULL THEN
    RETURN json_build_object('result', 'locked');
  END IF;

  v_decrypted := public.portal_decrypt_pin(v_row.portal_pin_enc);

  IF v_decrypted <> trim(p_pin) THEN
    UPDATE participants
    SET portal_failed_attempts = portal_failed_attempts + 1,
        portal_locked_at = CASE
          WHEN portal_failed_attempts + 1 >= 100 THEN NOW()
          ELSE portal_locked_at
        END
    WHERE id = v_row.id;

    IF v_row.portal_failed_attempts + 1 >= 100 THEN
      RETURN json_build_object('result', 'locked');
    END IF;

    RETURN json_build_object(
      'result', 'invalid_pin',
      'attempts_remaining', GREATEST(0, 100 - (v_row.portal_failed_attempts + 1))
    );
  END IF;

  UPDATE participants
  SET portal_failed_attempts = 0
  WHERE id = v_row.id;

  v_expires := public.portal_season_expires_at();
  v_nonce := gen_random_uuid();

  INSERT INTO portal_sessions (nonce, participant_id, expires_at)
  VALUES (v_nonce, v_row.id, v_expires);

  RETURN json_build_object(
    'result', 'ok',
    'session_nonce', v_nonce,
    'expires_at', v_expires,
    'participant_id', v_row.id
  );
END;
$$;

-- ── get_portal_dashboard ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_portal_dashboard(p_token uuid, p_nonce uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
  v_part participants%ROWTYPE;
  v_family families%ROWTYPE;
  v_upcoming json;
  v_history json;
BEGIN
  v_participant_id := public.portal_validate_session(p_token, p_nonce);
  IF v_participant_id IS NULL THEN
    RETURN json_build_object('result', 'unauthorized');
  END IF;

  SELECT * INTO v_part FROM participants WHERE id = v_participant_id;
  SELECT * INTO v_family FROM families WHERE id = v_part.family_id;

  v_upcoming := public.get_portal_upcoming_entry(v_participant_id);
  v_history := public.get_portal_recent_entries(v_participant_id, 12);

  RETURN json_build_object(
    'result', 'ok',
    'participant', json_build_object(
      'id', v_part.id,
      'full_name', v_part.full_name,
      'birth_date', v_part.birth_date,
      'gender', v_part.gender,
      'grade', v_part.grade,
      'has_photo', v_part.portal_photo_data IS NOT NULL,
      'photo_url', public.portal_photo_data_url(v_part.portal_photo_data, v_part.portal_photo_mime),
      'photo_uploaded_at', v_part.photo_uploaded_at
    ),
    'family', json_build_object(
      'parent_name', v_family.parent_name,
      'phone', v_family.phone,
      'email', v_family.email
    ),
    'upcoming', v_upcoming,
    'recent_entries', v_history,
    'session_expires_at', public.portal_season_expires_at()
  );
END;
$$;

-- ── update_portal_profile ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_portal_profile(p_token uuid, p_nonce uuid, p_payload json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
  v_part participants%ROWTYPE;
BEGIN
  v_participant_id := public.portal_validate_session(p_token, p_nonce);
  IF v_participant_id IS NULL THEN
    RETURN json_build_object('result', 'unauthorized');
  END IF;

  SELECT * INTO v_part FROM participants WHERE id = v_participant_id;

  UPDATE families
  SET
    parent_name = COALESCE(NULLIF(trim(p_payload->>'parent_name'), ''), parent_name),
    phone = COALESCE(NULLIF(trim(p_payload->>'phone'), ''), phone),
    email = CASE WHEN p_payload ? 'email' THEN NULLIF(trim(p_payload->>'email'), '') ELSE email END
  WHERE id = v_part.family_id;

  UPDATE participants
  SET
    full_name = COALESCE(NULLIF(trim(p_payload->>'full_name'), ''), full_name),
    birth_date = CASE
      WHEN p_payload ? 'birth_date' AND NULLIF(p_payload->>'birth_date', '') IS NOT NULL
      THEN (p_payload->>'birth_date')::date
      WHEN p_payload ? 'birth_date' THEN NULL
      ELSE birth_date
    END,
    gender = CASE WHEN p_payload ? 'gender' THEN NULLIF(p_payload->>'gender', '') ELSE gender END,
    grade = CASE WHEN p_payload ? 'grade' THEN NULLIF(p_payload->>'grade', '') ELSE grade END
  WHERE id = v_participant_id;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── set_portal_photo (registration only for parents) ────────
CREATE OR REPLACE FUNCTION public.set_portal_photo(
  p_token uuid,
  p_nonce uuid,
  p_photo_base64 text,
  p_mime text DEFAULT 'image/jpeg'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
  v_data bytea;
BEGIN
  v_participant_id := public.portal_validate_session(p_token, p_nonce);
  IF v_participant_id IS NULL THEN
    RETURN json_build_object('result', 'unauthorized');
  END IF;

  IF EXISTS (
    SELECT 1 FROM participants
    WHERE id = v_participant_id AND portal_photo_data IS NOT NULL
  ) THEN
    RETURN json_build_object('result', 'photo_exists');
  END IF;

  IF p_photo_base64 IS NULL OR length(p_photo_base64) = 0 THEN
    RETURN json_build_object('result', 'invalid_input');
  END IF;

  v_data := decode(p_photo_base64, 'base64');
  IF length(v_data) > 512000 THEN
    RETURN json_build_object('result', 'too_large');
  END IF;

  UPDATE participants
  SET
    portal_photo_data = v_data,
    portal_photo_mime = COALESCE(NULLIF(p_mime, ''), 'image/jpeg'),
    photo_uploaded_at = NOW()
  WHERE id = v_participant_id;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── Staff RPCs ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_get_portal_credentials(p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row participants%ROWTYPE;
  v_pin text;
BEGIN
  IF NOT public.is_staff_portal_viewer() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM participants WHERE id = p_participant_id;
  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_row.portal_token IS NULL OR v_row.portal_pin_enc IS NULL THEN
    RETURN json_build_object('result', 'no_portal');
  END IF;

  v_pin := public.portal_decrypt_pin(v_row.portal_pin_enc);

  INSERT INTO portal_audit_log (participant_id, action, actor_id)
  VALUES (p_participant_id, 'view_credentials', auth.uid());

  RETURN json_build_object(
    'result', 'ok',
    'portal_token', v_row.portal_token,
    'portal_pin', v_pin,
    'portal_locked', v_row.portal_locked_at IS NOT NULL,
    'photo_url', public.portal_photo_data_url(v_row.portal_photo_data, v_row.portal_photo_mime),
    'photo_missing', v_row.portal_photo_data IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_reset_portal_pin(p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin text;
  v_token uuid;
BEGIN
  IF NOT public.is_staff_portal_admin() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_pin := public.generate_portal_pin();

  UPDATE participants
  SET
    portal_pin_enc = public.portal_encrypt_pin(v_pin),
    portal_failed_attempts = 0,
    portal_locked_at = NULL,
    portal_token = COALESCE(portal_token, gen_random_uuid())
  WHERE id = p_participant_id
  RETURNING portal_token INTO v_token;

  IF v_token IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  DELETE FROM portal_sessions WHERE participant_id = p_participant_id;

  INSERT INTO portal_audit_log (participant_id, action, actor_id)
  VALUES (p_participant_id, 'reset_pin', auth.uid());

  RETURN json_build_object(
    'result', 'ok',
    'portal_token', v_token,
    'portal_pin', v_pin
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_set_participant_photo(
  p_participant_id uuid,
  p_photo_base64 text,
  p_mime text DEFAULT 'image/jpeg'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data bytea;
BEGIN
  IF NOT public.is_staff_photo_editor() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_photo_base64 IS NULL OR length(p_photo_base64) = 0 THEN
    UPDATE participants
    SET portal_photo_data = NULL, portal_photo_mime = NULL, photo_uploaded_at = NULL
    WHERE id = p_participant_id;
    RETURN json_build_object('result', 'ok');
  END IF;

  v_data := decode(p_photo_base64, 'base64');
  IF length(v_data) > 512000 THEN
    RETURN json_build_object('result', 'too_large');
  END IF;

  UPDATE participants
  SET
    portal_photo_data = v_data,
    portal_photo_mime = COALESCE(NULLIF(p_mime, ''), 'image/jpeg'),
    photo_uploaded_at = NOW()
  WHERE id = p_participant_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── Participant photo for guard scan ────────────────────────
CREATE OR REPLACE FUNCTION public.participant_photo_meta(p_participant_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'photo_missing', portal_photo_data IS NULL,
    'photo_url', public.portal_photo_data_url(portal_photo_data, portal_photo_mime)
  )
  FROM participants
  WHERE id = p_participant_id;
$$;

-- ── redeem_lesson_qr ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_lesson_qr(p_qr_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_now timestamptz := NOW();
  v_earliest timestamptz;
  v_latest timestamptz;
  v_photo json;
BEGIN
  SELECT
    l.*,
    p.full_name AS participant_full_name,
    p.id AS pid
  INTO r
  FROM lessons l
  LEFT JOIN participants p ON p.id = l.participant_id
  WHERE l.qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF r.cancelled THEN
    RETURN json_build_object('result', 'cancelled', 'child_name', r.child_name);
  END IF;

  IF r.used THEN
    RETURN json_build_object(
      'result', 'already_used',
      'used_at', r.used_at,
      'child_name', r.child_name,
      'lesson_date', r.lesson_date,
      'start_time', r.start_time,
      'instructor_name', r.instructor_name
    );
  END IF;

  IF r.payment_status = 'unpaid' THEN
    RETURN json_build_object('result', 'unpaid', 'child_name', r.child_name);
  END IF;

  v_earliest := r.lesson_date::timestamptz + r.start_time - INTERVAL '30 minutes';
  v_latest := r.lesson_date::timestamptz + r.start_time + INTERVAL '30 minutes';

  IF v_now < v_earliest THEN
    RETURN json_build_object('result', 'too_early', 'child_name', r.child_name, 'valid_from', v_earliest);
  END IF;

  IF v_now > v_latest THEN
    RETURN json_build_object('result', 'too_late', 'child_name', r.child_name, 'valid_until', v_latest);
  END IF;

  UPDATE lessons
  SET used = TRUE, used_at = v_now
  WHERE id = r.id;

  PERFORM public.mark_lesson_scan_attendance(r.id);

  IF r.pid IS NOT NULL THEN
    v_photo := public.participant_photo_meta(r.pid);
  ELSE
    v_photo := json_build_object('photo_missing', TRUE, 'photo_url', NULL);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'child_name', r.child_name,
    'lesson_date', r.lesson_date,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'instructor_name', r.instructor_name,
    'participant_id', r.pid,
    'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
    'photo_url', v_photo->>'photo_url'
  );
END;
$$;

-- ── redeem_access_pass (photo fields) ───────────────────────
CREATE OR REPLACE FUNCTION public.redeem_access_pass(p_qr_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_now timestamptz := now();
  v_log_reason text;
  v_photo json;
BEGIN
  SELECT
    ap.id AS pass_id,
    ap.qr_token,
    ap.status AS pass_status,
    ap.valid_from,
    ap.valid_until,
    ap.used_at,
    ap.session_id,
    ap.enrollment_id,
    ap.participant_id,
    p.full_name AS child_name,
    ss.session_date,
    ss.start_time,
    ss.end_time,
    ss.status AS session_status,
    pr.name AS product_name,
    pr.instructor_name,
    e.payment_status,
    e.active AS enrollment_active,
    s.active AS season_active
  INTO r
  FROM access_passes ap
  JOIN participants p ON p.id = ap.participant_id
  JOIN scheduled_sessions ss ON ss.id = ap.session_id
  JOIN products pr ON pr.id = ss.product_id
  JOIN seasons s ON s.id = pr.season_id
  JOIN enrollments e ON e.id = ap.enrollment_id
  WHERE ap.qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  v_photo := public.participant_photo_meta(r.participant_id);

  IF NOT r.season_active THEN
    RETURN json_build_object(
      'result', 'season_inactive',
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF r.pass_status = 'used' OR r.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'result', 'already_used',
      'used_at', r.used_at,
      'child_name', r.child_name,
      'session_date', r.session_date,
      'start_time', r.start_time,
      'product_name', r.product_name,
      'instructor_name', r.instructor_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF r.pass_status = 'cancelled' OR r.session_status = 'cancelled' THEN
    RETURN json_build_object(
      'result', 'cancelled',
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF NOT r.enrollment_active THEN
    RETURN json_build_object(
      'result', 'inactive',
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF r.payment_status = 'unpaid' THEN
    RETURN json_build_object(
      'result', 'unpaid',
      'child_name', r.child_name,
      'product_name', r.product_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF v_now < r.valid_from THEN
    RETURN json_build_object(
      'result', 'too_early',
      'valid_from', r.valid_from,
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF v_now > r.valid_until THEN
    RETURN json_build_object(
      'result', 'too_late',
      'valid_until', r.valid_until,
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF r.pass_status <> 'active' THEN
    RETURN json_build_object(
      'result', 'expired',
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  UPDATE access_passes
  SET status = 'used', used_at = v_now, scanned_by = auth.uid()
  WHERE id = r.pass_id;

  PERFORM public.apply_guard_scan_attendance(
    r.session_id, r.enrollment_id, r.participant_id, r.child_name, r.pass_id, auth.uid()
  );

  v_log_reason := json_build_object(
    'child_name', r.child_name,
    'session_date', r.session_date,
    'start_time', r.start_time,
    'product_name', r.product_name,
    'instructor_name', r.instructor_name
  )::text;

  INSERT INTO access_logs (pass_id, result, reason, scanned_by, scanned_at)
  VALUES (r.pass_id, 'ok', v_log_reason, auth.uid(), v_now);

  RETURN json_build_object(
    'result', 'ok',
    'child_name', r.child_name,
    'session_date', r.session_date,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'product_name', r.product_name,
    'instructor_name', r.instructor_name,
    'payment_status', r.payment_status,
    'participant_id', r.participant_id,
    'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
    'photo_url', v_photo->>'photo_url'
  );
END;
$$;

-- ── Enrollment trigger (skip assessments) ───────────────────
CREATE OR REPLACE FUNCTION public.enrollment_ensure_portal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT pt.code INTO v_code
  FROM products p
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.id = NEW.product_id;

  IF v_code IS DISTINCT FROM 'swim_assessment' THEN
    PERFORM public.ensure_participant_portal(NEW.participant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enrollments_ensure_portal_trg ON enrollments;
CREATE TRIGGER enrollments_ensure_portal_trg
  AFTER INSERT ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.enrollment_ensure_portal();

-- ── Grants ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.portal_pin_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_encrypt_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_decrypt_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_validate_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_portal_pin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_photo_data_url(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_season_expires_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_upcoming_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_recent_entries(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_photo_meta(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_portal_viewer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_portal_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_photo_editor() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_participant_portal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_portal_pin(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_dashboard(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_portal_profile(uuid, uuid, json) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_portal_photo(uuid, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_portal_credentials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reset_portal_pin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_participant_photo(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_lesson_qr(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_access_pass(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_access_pass(uuid) TO authenticated;

SELECT 'Child portal migration complete' AS status;
