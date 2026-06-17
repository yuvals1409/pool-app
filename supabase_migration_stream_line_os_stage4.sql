-- ============================================================
--  MIGRATION: Stream Line OS — שלב 4
--  קורס קיץ (course_series), הזמנות קיץ, תוצאות מבדק
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS schedule_pattern JSONB NOT NULL DEFAULT '{}';

ALTER TABLE assessment_leads
  ADD COLUMN IF NOT EXISTS assessment_result TEXT NOT NULL DEFAULT 'pending'
    CHECK (assessment_result IN ('pending', 'passed', 'failed'));

ALTER TABLE assessment_leads
  ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ;

ALTER TABLE assessment_leads
  ADD COLUMN IF NOT EXISTS assessed_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS assessment_leads_result_idx ON assessment_leads (assessment_result);

CREATE TABLE IF NOT EXISTS summer_invitations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_lead_id UUID NOT NULL REFERENCES assessment_leads(id) ON DELETE CASCADE,
  participant_id     UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  token              UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at         TIMESTAMPTZ NOT NULL,
  used_at            TIMESTAMPTZ,
  enrollment_id      UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS summer_invitations_token_idx ON summer_invitations (token);
CREATE INDEX IF NOT EXISTS summer_invitations_lead_idx ON summer_invitations (assessment_lead_id);

ALTER TABLE summer_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read summer invitations" ON summer_invitations;
CREATE POLICY "admin read summer invitations"
  ON summer_invitations FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "staff read summer invitations" ON summer_invitations;
CREATE POLICY "staff read summer invitations"
  ON summer_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND status = 'approved'
        AND role IN ('admin', 'instructor')
    )
  );

-- ── helpers ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_instructor_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role IN ('admin', 'instructor')
  );
$$;

REVOKE ALL ON FUNCTION public.is_instructor_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_instructor_or_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.effective_schedule_pattern(p_product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(p.schedule_pattern, '{}'::jsonb), pt.schedule_pattern)
  FROM products p
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.id = p_product_id;
$$;

-- ── course series sessions ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_course_series_sessions(p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product record;
  v_pattern jsonb;
  v_type text;
  v_start date;
  v_end date;
  v_weekdays integer[];
  v_d date;
  v_dow integer;
  v_session_id uuid;
  v_inserted_sessions integer := 0;
  v_inserted_attendees integer := 0;
  v_row_count integer;
BEGIN
  SELECT p.*, pt.code AS template_code
  INTO v_product
  FROM products p
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  v_pattern := public.effective_schedule_pattern(p_product_id);
  v_type := v_pattern->>'type';

  IF v_type IS DISTINCT FROM 'course_series' THEN
    RAISE EXCEPTION 'not_course_series_product';
  END IF;

  v_start := (v_pattern->>'course_start')::date;
  v_end := (v_pattern->>'course_end')::date;

  IF v_start IS NULL OR v_end IS NULL THEN
    RAISE EXCEPTION 'course_dates_missing';
  END IF;

  SELECT COALESCE(array_agg((value::text)::integer ORDER BY ord), ARRAY[]::integer[])
  INTO v_weekdays
  FROM jsonb_array_elements_text(COALESCE(v_pattern->'weekdays', '[]'::jsonb))
    WITH ORDINALITY AS t(value, ord);

  IF array_length(v_weekdays, 1) IS NULL THEN
    RAISE EXCEPTION 'course_weekdays_missing';
  END IF;

  v_d := v_start;
  WHILE v_d <= v_end LOOP
    v_dow := EXTRACT(DOW FROM v_d)::integer;
    IF v_dow = ANY (v_weekdays) THEN
      INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
      VALUES (v_product.id, v_d, v_product.start_time, v_product.end_time)
      ON CONFLICT (product_id, session_date) DO NOTHING
      RETURNING id INTO v_session_id;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count > 0 THEN
        v_inserted_sessions := v_inserted_sessions + 1;
      END IF;

      IF v_session_id IS NULL THEN
        SELECT id INTO v_session_id
        FROM scheduled_sessions
        WHERE product_id = v_product.id
          AND session_date = v_d;
      END IF;

      INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
      SELECT v_session_id, e.id, e.participant_id
      FROM enrollments e
      WHERE e.product_id = p_product_id
        AND e.active = TRUE
        AND e.valid_from <= v_d
        AND e.valid_until >= v_d
      ON CONFLICT (session_id, enrollment_id) DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_inserted_attendees := v_inserted_attendees + v_row_count;
    END IF;
    v_d := v_d + 1;
  END LOOP;

  RETURN v_inserted_sessions;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_course_series_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_course_series_sessions(uuid) TO authenticated;

-- ── regenerate passes for enrollment ─────────────────────────
CREATE OR REPLACE FUNCTION public.regenerate_enrollment_passes(p_enrollment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment record;
  v_product record;
  v_pattern jsonb;
  v_from date;
  v_to date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT e.*, p.id AS pid
  INTO v_enrollment
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment_not_found';
  END IF;

  v_pattern := public.effective_schedule_pattern(v_enrollment.product_id);
  v_from := CURRENT_DATE;

  IF v_pattern->>'type' = 'course_series' THEN
    v_to := COALESCE((v_pattern->>'course_end')::date, v_enrollment.valid_until);
    PERFORM public.generate_course_series_sessions(v_enrollment.product_id);
  ELSE
    v_to := CURRENT_DATE + 7;
    PERFORM public.generate_weekly_sessions(v_from, v_to);
  END IF;

  RETURN public.generate_access_passes(v_from, v_to);
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_enrollment_passes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_enrollment_passes(uuid) TO authenticated;

-- ── list today's assessment leads (instructor/admin) ─────────
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
          AND al.status = 'new'
      ) t
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_today_assessment_leads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_today_assessment_leads() TO authenticated;

-- ── set assessment result + summer invite ────────────────────
CREATE OR REPLACE FUNCTION public.set_assessment_result(p_lead_id uuid, p_result text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_token uuid;
  v_invite_id uuid;
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
    assessed_by = CASE WHEN p_result = 'pending' THEN NULL ELSE auth.uid() END
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

REVOKE ALL ON FUNCTION public.set_assessment_result(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_assessment_result(uuid, text) TO authenticated;

-- ── summer invite preview (public) ───────────────────────────
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

  IF v_invite.lead_status = 'cancelled' THEN
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

REVOKE ALL ON FUNCTION public.get_summer_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_summer_invite(uuid) TO anon, authenticated;

-- ── register summer course (public, invite only) ───────────────
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

  IF v_invite.expires_at < NOW() OR v_invite.lead_status = 'cancelled' THEN
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
  SET status = 'converted', assessment_result = 'passed'
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

REVOKE ALL ON FUNCTION public.register_summer_course(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_summer_course(uuid, uuid) TO anon, authenticated;

-- instructor read assessment leads for today
DROP POLICY IF EXISTS "staff read assessment leads" ON assessment_leads;
CREATE POLICY "staff read assessment leads"
  ON assessment_leads FOR SELECT
  USING (public.is_admin() OR public.is_instructor_or_admin());

SELECT 'Stream Line OS stage 4 migration complete' AS status;
