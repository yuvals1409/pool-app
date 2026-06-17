-- ============================================================
--  MIGRATION: Stream Line OS — שלב 2 (ימים 3–4)
--  RPC לסריקת שומר ודף כרטיס ציבורי
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_pass(p_public_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT
    ap.qr_token,
    ap.public_token,
    ap.status,
    ap.valid_from,
    ap.valid_until,
    ap.used_at,
    p.full_name AS child_name,
    ss.session_date,
    ss.start_time,
    ss.end_time,
    ss.status AS session_status,
    pr.name AS product_name,
    pr.instructor_name,
    e.payment_status,
    e.active AS enrollment_active
  INTO r
  FROM access_passes ap
  JOIN participants p ON p.id = ap.participant_id
  JOIN scheduled_sessions ss ON ss.id = ap.session_id
  JOIN products pr ON pr.id = ss.product_id
  JOIN enrollments e ON e.id = ap.enrollment_id
  WHERE ap.public_token = p_public_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'qr_token', r.qr_token,
    'public_token', r.public_token,
    'status', r.status,
    'valid_from', r.valid_from,
    'valid_until', r.valid_until,
    'used_at', r.used_at,
    'child_name', r.child_name,
    'session_date', r.session_date,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'session_status', r.session_status,
    'product_name', r.product_name,
    'instructor_name', r.instructor_name,
    'payment_status', r.payment_status,
    'enrollment_active', r.enrollment_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_pass(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_pass(uuid) TO anon, authenticated;

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
BEGIN
  SELECT
    ap.id AS pass_id,
    ap.qr_token,
    ap.status AS pass_status,
    ap.valid_from,
    ap.valid_until,
    ap.used_at,
    p.full_name AS child_name,
    ss.session_date,
    ss.start_time,
    ss.end_time,
    ss.status AS session_status,
    pr.name AS product_name,
    pr.instructor_name,
    e.payment_status,
    e.active AS enrollment_active
  INTO r
  FROM access_passes ap
  JOIN participants p ON p.id = ap.participant_id
  JOIN scheduled_sessions ss ON ss.id = ap.session_id
  JOIN products pr ON pr.id = ss.product_id
  JOIN enrollments e ON e.id = ap.enrollment_id
  WHERE ap.qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF r.pass_status = 'used' OR r.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'result', 'already_used',
      'used_at', r.used_at,
      'child_name', r.child_name,
      'session_date', r.session_date,
      'start_time', r.start_time,
      'product_name', r.product_name,
      'instructor_name', r.instructor_name
    );
  END IF;

  IF r.pass_status = 'cancelled' OR r.session_status = 'cancelled' THEN
    RETURN json_build_object('result', 'cancelled', 'child_name', r.child_name);
  END IF;

  IF NOT r.enrollment_active THEN
    RETURN json_build_object('result', 'inactive', 'child_name', r.child_name);
  END IF;

  IF r.payment_status = 'unpaid' THEN
    RETURN json_build_object(
      'result', 'unpaid',
      'child_name', r.child_name,
      'product_name', r.product_name
    );
  END IF;

  IF v_now < r.valid_from THEN
    RETURN json_build_object(
      'result', 'too_early',
      'valid_from', r.valid_from,
      'child_name', r.child_name
    );
  END IF;

  IF v_now > r.valid_until THEN
    RETURN json_build_object(
      'result', 'too_late',
      'valid_until', r.valid_until,
      'child_name', r.child_name
    );
  END IF;

  IF r.pass_status <> 'active' THEN
    RETURN json_build_object('result', 'expired', 'child_name', r.child_name);
  END IF;

  UPDATE access_passes
  SET status = 'used', used_at = v_now, scanned_by = auth.uid()
  WHERE id = r.pass_id;

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
    'payment_status', r.payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_access_pass(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_access_pass(uuid) TO authenticated;

SELECT 'Stream Line OS stage 2 migration complete' AS status;
