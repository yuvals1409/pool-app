-- ============================================================
--  Portal: post-entry exit notice for external (non-member) families
--  Run once in Supabase SQL Editor on existing DB
-- ============================================================

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
  v_scanned record;
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
  v_leave_until timestamptz;
BEGIN
  SELECT p.full_name INTO v_child_name FROM participants p WHERE p.id = p_participant_id;

  -- Approved entry today — show until 15 minutes after lesson end (exit notice window)
  SELECT *
  INTO v_scanned
  FROM (
    SELECT
      ap.used_at,
      'pass'::text AS entry_type,
      ss.session_date,
      ss.start_time,
      ss.end_time,
      pr.name AS product_name,
      pr.instructor_name
    FROM access_passes ap
    JOIN scheduled_sessions ss ON ss.id = ap.session_id
    JOIN products pr ON pr.id = ss.product_id
    WHERE ap.participant_id = p_participant_id
      AND ap.status = 'used'
      AND ap.used_at IS NOT NULL
      AND ss.session_date = CURRENT_DATE
      AND ss.status <> 'cancelled'
    UNION ALL
    SELECT
      l.used_at,
      'lesson'::text AS entry_type,
      l.lesson_date AS session_date,
      l.start_time,
      l.end_time,
      NULL::text AS product_name,
      l.instructor_name
    FROM lessons l
    WHERE l.participant_id = p_participant_id
      AND l.used = TRUE
      AND l.used_at IS NOT NULL
      AND l.cancelled = FALSE
      AND l.lesson_date = CURRENT_DATE
  ) scanned
  ORDER BY scanned.used_at DESC
  LIMIT 1;

  IF v_scanned.used_at IS NOT NULL THEN
    v_leave_until := v_scanned.session_date::timestamptz
      + COALESCE(v_scanned.end_time, v_scanned.start_time)
      + INTERVAL '15 minutes';
    IF v_now <= v_leave_until THEN
      RETURN json_build_object(
        'result', 'ok',
        'has_entry', TRUE,
        'entry_type', v_scanned.entry_type,
        'entry_scanned', TRUE,
        'used_at', v_scanned.used_at,
        'blocked_reason', 'already_used',
        'qr_token', NULL,
        'child_name', v_child_name,
        'session_date', v_scanned.session_date,
        'start_time', v_scanned.start_time,
        'end_time', v_scanned.end_time,
        'product_name', v_scanned.product_name,
        'instructor_name', v_scanned.instructor_name,
        'leave_until', v_leave_until
      );
    END IF;
  END IF;

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
    'entry_scanned', FALSE,
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
  v_tier text;
BEGIN
  v_participant_id := public.portal_validate_session(p_token, p_nonce);
  IF v_participant_id IS NULL THEN
    RETURN json_build_object('result', 'unauthorized');
  END IF;

  SELECT * INTO v_part FROM participants WHERE id = v_participant_id;
  SELECT * INTO v_family FROM families WHERE id = v_part.family_id;

  v_upcoming := public.get_portal_upcoming_entry(v_participant_id);
  v_history := public.get_portal_recent_entries(v_participant_id, 12);
  v_tier := public.resolve_effective_tier(v_participant_id, 'swim_course_12');

  RETURN json_build_object(
    'result', 'ok',
    'is_external', (v_tier = 'external'),
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
