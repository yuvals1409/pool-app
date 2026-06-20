-- ============================================================
--  MIGRATION: CRM לידים מלא — משפך סטטוסים, מקורות, משימות מעקב
-- ============================================================

-- ── 1. הרחבת assessment_leads ────────────────────────────────
ALTER TABLE assessment_leads ALTER COLUMN slot_id DROP NOT NULL;

ALTER TABLE assessment_leads ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE assessment_leads DROP CONSTRAINT IF EXISTS assessment_leads_status_check;

UPDATE assessment_leads SET status = 'registered_class' WHERE status = 'converted';
UPDATE assessment_leads SET status = 'abandoned' WHERE status = 'cancelled';
UPDATE assessment_leads SET status = 'passed'
  WHERE assessment_result = 'passed' AND status NOT IN ('registered_class', 'abandoned');
UPDATE assessment_leads SET status = 'registered_assessment'
  WHERE slot_id IS NOT NULL AND status = 'new';

ALTER TABLE assessment_leads ADD CONSTRAINT assessment_leads_status_check
  CHECK (status IN ('new', 'call', 'registered_assessment', 'passed', 'registered_class', 'abandoned'));

UPDATE assessment_leads SET source = 'website' WHERE source = 'web' OR source IS NULL OR source = '';
UPDATE assessment_leads SET source = 'website'
  WHERE source NOT IN ('recommendation', 'facebook', 'website', 'import');

ALTER TABLE assessment_leads DROP CONSTRAINT IF EXISTS assessment_leads_source_check;
ALTER TABLE assessment_leads ADD CONSTRAINT assessment_leads_source_check
  CHECK (source IN ('recommendation', 'facebook', 'website', 'import'));

ALTER TABLE assessment_leads ALTER COLUMN source SET DEFAULT 'website';

-- ── 2. משימות מעקב ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_follow_up_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES assessment_leads(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  due_date     DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_follow_up_tasks_lead_idx
  ON lead_follow_up_tasks (lead_id);

CREATE INDEX IF NOT EXISTS lead_follow_up_tasks_due_idx
  ON lead_follow_up_tasks (due_date)
  WHERE completed_at IS NULL;

ALTER TABLE lead_follow_up_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin office read lead tasks" ON lead_follow_up_tasks;
CREATE POLICY "admin office read lead tasks"
  ON lead_follow_up_tasks FOR SELECT
  USING (public.is_admin_or_office());

DROP POLICY IF EXISTS "admin office manage lead tasks" ON lead_follow_up_tasks;
CREATE POLICY "admin office manage lead tasks"
  ON lead_follow_up_tasks FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ── 3. RLS — גישת משרד ללידים ────────────────────────────────
DROP POLICY IF EXISTS "office read assessment leads" ON assessment_leads;
CREATE POLICY "office read assessment leads"
  ON assessment_leads FOR SELECT
  USING (public.is_admin_or_office());

DROP POLICY IF EXISTS "office update assessment leads" ON assessment_leads;
CREATE POLICY "office update assessment leads"
  ON assessment_leads FOR UPDATE
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ── 4. helper: normalize lead source ─────────────────────────
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
  IF v_source IN ('recommendation', 'facebook', 'website', 'import') THEN
    RETURN v_source;
  END IF;
  IF v_source = 'web' THEN
    RETURN 'website';
  END IF;
  RETURN 'website';
END;
$$;

-- ── 5. register_assessment (עם source + סטטוס CRM) ───────────
DROP FUNCTION IF EXISTS public.register_assessment(uuid, text, integer, text, text);

CREATE OR REPLACE FUNCTION public.register_assessment(
  p_slot_id uuid,
  p_child_name text,
  p_child_age integer,
  p_parent_name text,
  p_phone text,
  p_source text DEFAULT 'website'
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
BEGIN
  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));
  v_source := public.normalize_lead_source(p_source);

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

REVOKE ALL ON FUNCTION public.register_assessment(uuid, text, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_assessment(uuid, text, integer, text, text, text) TO anon, authenticated;

-- ── 6. create_assessment_lead (ליד ידני) ─────────────────────
CREATE OR REPLACE FUNCTION public.create_assessment_lead(
  p_phone text,
  p_child_name text,
  p_parent_name text DEFAULT NULL,
  p_source text DEFAULT 'website',
  p_notes text DEFAULT NULL,
  p_child_age integer DEFAULT NULL
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
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));
  v_source := public.normalize_lead_source(p_source);

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

  INSERT INTO assessment_leads (
    participant_id, child_age, status, source, notes
  ) VALUES (
    v_participant_id, p_child_age, 'new', v_source, NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_lead_id;

  RETURN json_build_object('result', 'ok', 'lead_id', v_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_assessment_lead(text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_assessment_lead(text, text, text, text, text, integer) TO authenticated;

-- ── 7. update_lead_crm ───────────────────────────────────────
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
    IF v_lead.slot_id IS NOT NULL THEN
      UPDATE assessment_slots SET enrolled_count = GREATEST(enrolled_count - 1, 0)
        WHERE id = v_lead.slot_id;
    END IF;
  END IF;

  RETURN json_build_object('result', 'ok', 'lead_id', p_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_lead_crm(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_lead_crm(uuid, text, text, text, uuid) TO authenticated;

-- ── 8. משימות מעקב RPCs ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_lead_task(
  p_lead_id uuid,
  p_title text,
  p_due_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF trim(COALESCE(p_title, '')) = '' OR p_due_date IS NULL THEN
    RETURN json_build_object('result', 'invalid_input');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM assessment_leads WHERE id = p_lead_id) THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  INSERT INTO lead_follow_up_tasks (lead_id, title, due_date, created_by)
  VALUES (p_lead_id, trim(p_title), p_due_date, auth.uid())
  RETURNING id INTO v_task_id;

  RETURN json_build_object('result', 'ok', 'task_id', v_task_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_lead_task(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lead_task(uuid, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_lead_task(p_task_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  UPDATE lead_follow_up_tasks
  SET completed_at = NOW()
  WHERE id = p_task_id AND completed_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  RETURN json_build_object('result', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.complete_lead_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_lead_task(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_due_lead_tasks()
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
      SELECT json_agg(row_to_json(sub) ORDER BY sub.due_date, sub.created_at)
      FROM (
        SELECT
          t.id AS task_id,
          t.title,
          t.due_date,
          t.created_at,
          t.lead_id,
          p.full_name AS child_name,
          f.phone AS parent_phone,
          f.parent_name,
          al.status AS lead_status
        FROM lead_follow_up_tasks t
        JOIN assessment_leads al ON al.id = t.lead_id
        LEFT JOIN participants p ON p.id = al.participant_id
        LEFT JOIN families f ON f.id = p.family_id
        WHERE t.completed_at IS NULL
          AND t.due_date <= CURRENT_DATE
      ) sub
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_due_lead_tasks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_due_lead_tasks() TO authenticated;

-- ── 9. עדכון RPCs קיימים ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_today_assessment_leads()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.start_time, t.child_name)
      FROM (
        SELECT
          al.id AS lead_id,
          al.assessment_result,
          al.child_age,
          al.status AS lead_status,
          s.slot_date,
          s.start_time,
          p.full_name AS child_name,
          f.phone AS parent_phone,
          f.parent_name,
          si.token AS summer_invite_token,
          si.used_at AS invite_used_at
        FROM assessment_leads al
        JOIN assessment_slots s ON s.id = al.slot_id
        LEFT JOIN participants p ON p.id = al.participant_id
        LEFT JOIN families f ON f.id = p.family_id
        LEFT JOIN summer_invitations si ON si.assessment_lead_id = al.id
          AND si.used_at IS NULL
        WHERE s.slot_date = CURRENT_DATE
          AND s.active = TRUE
          AND al.status IN ('registered_assessment', 'passed')
          AND al.status <> 'abandoned'
      ) t
    ),
    '[]'::json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_assessment_result(p_lead_id uuid, p_result text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_token uuid;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_result NOT IN ('passed', 'failed', 'pending') THEN
    RETURN json_build_object('result', 'invalid_result');
  END IF;

  SELECT al.*, s.slot_date
  INTO v_lead
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE al.id = p_lead_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  UPDATE assessment_leads
  SET
    assessment_result = p_result,
    assessed_at = CASE WHEN p_result = 'pending' THEN NULL ELSE NOW() END,
    assessed_by = CASE WHEN p_result = 'pending' THEN NULL ELSE auth.uid() END,
    status = CASE
      WHEN p_result = 'passed' THEN 'passed'
      WHEN p_result = 'pending' THEN 'registered_assessment'
      ELSE status
    END
  WHERE id = p_lead_id;

  IF p_result = 'passed' AND v_lead.participant_id IS NOT NULL THEN
    SELECT token INTO v_token
    FROM summer_invitations
    WHERE assessment_lead_id = p_lead_id
      AND used_at IS NULL
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_token IS NULL THEN
      INSERT INTO summer_invitations (
        assessment_lead_id, participant_id, expires_at
      ) VALUES (
        p_lead_id,
        v_lead.participant_id,
        (v_lead.slot_date + interval '90 days')
      )
      RETURNING token INTO v_token;
    END IF;

    RETURN json_build_object(
      'result', 'ok',
      'assessment_result', p_result,
      'summer_invite_token', v_token
    );
  END IF;

  RETURN json_build_object('result', 'ok', 'assessment_result', p_result);
END;
$$;

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
            END AS spots_left
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
        WHERE c.spots_left > 0
      ),
      '[]'::json
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_summer_course(p_token uuid, p_product_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_product record;
  v_pattern jsonb;
  v_enrolled integer;
  v_enrollment_id uuid;
  v_session_id uuid;
  v_public_token uuid;
BEGIN
  SELECT si.*, al.status AS lead_status, al.participant_id
  INTO v_invite
  FROM summer_invitations si
  JOIN assessment_leads al ON al.id = si.assessment_lead_id
  WHERE si.token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RETURN json_build_object('result', 'already_used');
  END IF;

  IF v_invite.expires_at < NOW() OR v_invite.lead_status = 'abandoned' THEN
    RETURN json_build_object('result', 'invite_invalid');
  END IF;

  SELECT p.*, pt.code AS template_code
  INTO v_product
  FROM products p
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.id = p_product_id;

  IF NOT FOUND OR v_product.template_code <> 'summer_course' THEN
    RETURN json_build_object('result', 'invalid_product');
  END IF;

  v_pattern := public.effective_schedule_pattern(p_product_id);

  SELECT COUNT(*) INTO v_enrolled
  FROM enrollments
  WHERE product_id = p_product_id AND active = TRUE;

  IF v_product.capacity IS NOT NULL AND v_enrolled >= v_product.capacity THEN
    RETURN json_build_object('result', 'course_full');
  END IF;

  IF EXISTS (
    SELECT 1 FROM enrollments
    WHERE participant_id = v_invite.participant_id
      AND product_id = p_product_id
      AND active = TRUE
  ) THEN
    RETURN json_build_object('result', 'duplicate_enrollment');
  END IF;

  INSERT INTO enrollments (
    product_id, participant_id, payment_status,
    valid_from, valid_until, active
  ) VALUES (
    p_product_id,
    v_invite.participant_id,
    'unpaid',
    COALESCE((v_pattern->>'course_start')::date, CURRENT_DATE),
    COALESCE((v_pattern->>'course_end')::date, CURRENT_DATE + 60),
    TRUE
  )
  RETURNING id INTO v_enrollment_id;

  PERFORM public.generate_course_series_sessions(p_product_id);
  PERFORM public.generate_access_passes(
    CURRENT_DATE,
    COALESCE((v_pattern->>'course_end')::date, CURRENT_DATE + 60)
  );

  SELECT ss.id INTO v_session_id
  FROM scheduled_sessions ss
  WHERE ss.product_id = p_product_id
    AND ss.session_date >= CURRENT_DATE
    AND ss.status = 'scheduled'
  ORDER BY ss.session_date, ss.start_time
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    SELECT public_token INTO v_public_token
    FROM access_passes
    WHERE session_id = v_session_id
      AND enrollment_id = v_enrollment_id
      AND status = 'active'
    ORDER BY valid_from
    LIMIT 1;
  END IF;

  UPDATE summer_invitations
  SET used_at = NOW(), enrollment_id = v_enrollment_id
  WHERE id = v_invite.id;

  UPDATE assessment_leads
  SET status = 'registered_class', assessment_result = 'passed'
  WHERE id = v_invite.assessment_lead_id;

  RETURN json_build_object(
    'result', 'ok',
    'public_token', v_public_token,
    'enrollment_id', v_enrollment_id,
    'child_name', (SELECT full_name FROM participants WHERE id = v_invite.participant_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('result', 'duplicate_enrollment');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_assessment_funnel(p_from date, p_to date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_registered integer;
  v_passed integer;
  v_failed integer;
  v_summer integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*) INTO v_registered
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.status NOT IN ('abandoned');

  SELECT COUNT(*) INTO v_passed
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.assessment_result = 'passed';

  SELECT COUNT(*) INTO v_failed
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.assessment_result = 'failed';

  SELECT COUNT(*) INTO v_summer
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.status = 'registered_class';

  RETURN json_build_object(
    'registered', v_registered,
    'passed', v_passed,
    'failed', v_failed,
    'summer_enrolled', v_summer
  );
END;
$$;

SELECT 'Leads CRM migration complete' AS status;
