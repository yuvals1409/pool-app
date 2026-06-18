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
