-- ============================================================
--  Master sheet V2 — no_show, staff fields, config extensions
-- ============================================================

-- assessment_result: add no_show
ALTER TABLE assessment_leads DROP CONSTRAINT IF EXISTS assessment_leads_assessment_result_check;
ALTER TABLE assessment_leads ADD CONSTRAINT assessment_leads_assessment_result_check
  CHECK (assessment_result IN ('pending', 'passed', 'failed', 'no_show'));

-- Profile fields for users sheet sync
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS hire_date DATE;

CREATE INDEX IF NOT EXISTS profiles_phone_idx ON profiles (phone) WHERE phone IS NOT NULL;

-- Link sheet groups to products
ALTER TABLE sheet_row_links
  ADD COLUMN IF NOT EXISTS group_id TEXT;

CREATE INDEX IF NOT EXISTS sheet_row_links_group_idx
  ON sheet_row_links (group_id)
  WHERE group_id IS NOT NULL;

-- Master sheet config extensions
ALTER TABLE master_sheet_config
  ADD COLUMN IF NOT EXISTS groups_tab TEXT DEFAULT 'קבוצות',
  ADD COLUMN IF NOT EXISTS slots_tab TEXT DEFAULT 'משבצות_קבוצות',
  ADD COLUMN IF NOT EXISTS users_tab TEXT DEFAULT 'משתמשים',
  ADD COLUMN IF NOT EXISTS last_groups_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_users_sync_at TIMESTAMPTZ;

-- Stable group id on products (sheet bootstrap)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sheet_group_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS products_sheet_group_id_idx
  ON products (sheet_group_id)
  WHERE sheet_group_id IS NOT NULL;

-- Apply assessment result including no_show (sheet sync + instructor UI)
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

  IF p_result NOT IN ('passed', 'failed', 'pending', 'no_show') THEN
    RETURN json_build_object('result', 'invalid_result');
  END IF;

  SELECT al.*, s.slot_date
  INTO v_lead
  FROM assessment_leads al
  LEFT JOIN assessment_slots s ON s.id = al.slot_id
  WHERE al.id = p_lead_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  UPDATE assessment_leads
  SET
    assessment_result = p_result,
    assessed_at = CASE WHEN p_result IN ('pending') THEN NULL ELSE NOW() END,
    assessed_by = CASE WHEN p_result IN ('pending') THEN NULL ELSE auth.uid() END,
    status = CASE
      WHEN p_result = 'passed' THEN 'passed'
      WHEN p_result = 'no_show' THEN 'abandoned'
      WHEN p_result = 'pending' THEN 'registered_assessment'
      ELSE status
    END
  WHERE id = p_lead_id;

  IF p_result = 'passed' AND v_lead.participant_id IS NOT NULL AND v_lead.slot_date IS NOT NULL THEN
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

-- Upsert role assignment from users sheet (pre-auth invite path)
CREATE OR REPLACE FUNCTION public.upsert_role_assignment_from_sheet(
  p_email text,
  p_role text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_email := lower(trim(COALESCE(p_email, '')));
  v_role := lower(trim(COALESCE(p_role, '')));

  IF v_email = '' OR v_role NOT IN ('admin', 'instructor', 'guard', 'office') THEN
    RETURN json_build_object('result', 'invalid_input');
  END IF;

  INSERT INTO role_assignments (email, role)
  VALUES (v_email, v_role)
  ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

  RETURN json_build_object('result', 'ok', 'email', v_email, 'role', v_role);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_role_assignment_from_sheet(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_role_assignment_from_sheet(text, text) TO authenticated;
