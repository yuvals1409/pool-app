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

