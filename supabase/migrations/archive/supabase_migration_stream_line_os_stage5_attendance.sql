-- ============================================================
--  MIGRATION: Stream Line OS — שלב 5 (נוכחות)
--  מעקב נוכחות לכל יישויות האימון + היסטוריה
-- ============================================================

-- ── 1. עמודות נוכחות נוכחיות ───────────────────────────────
ALTER TABLE session_attendees
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending', 'present', 'absent', 'excused', 'late'));

ALTER TABLE session_attendees
  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ;

ALTER TABLE session_attendees
  ADD COLUMN IF NOT EXISTS attendance_marked_by UUID REFERENCES profiles(id);

ALTER TABLE session_attendees
  ADD COLUMN IF NOT EXISTS attendance_source TEXT
    CHECK (attendance_source IS NULL OR attendance_source IN ('instructor', 'guard_scan', 'system'));

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending', 'present', 'absent', 'excused', 'late'));

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS attendance_marked_by UUID REFERENCES profiles(id);

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS attendance_source TEXT
    CHECK (attendance_source IS NULL OR attendance_source IN ('instructor', 'guard_scan', 'system'));

-- ── 2. היסטוריית נוכחות (append-only) ───────────────────────
CREATE TABLE IF NOT EXISTS attendance_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_session_id UUID REFERENCES scheduled_sessions(id) ON DELETE SET NULL,
  lesson_id            UUID REFERENCES lessons(id) ON DELETE SET NULL,
  participant_id       UUID REFERENCES participants(id) ON DELETE SET NULL,
  enrollment_id        UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  child_name           TEXT,
  status               TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late')),
  source               TEXT NOT NULL CHECK (source IN ('instructor', 'guard_scan', 'system')),
  marked_by            UUID REFERENCES profiles(id),
  marked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_pass_id       UUID REFERENCES access_passes(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (scheduled_session_id IS NOT NULL AND lesson_id IS NULL)
    OR (lesson_id IS NOT NULL AND scheduled_session_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS attendance_events_session_idx
  ON attendance_events (scheduled_session_id, marked_at DESC);

CREATE INDEX IF NOT EXISTS attendance_events_lesson_idx
  ON attendance_events (lesson_id, marked_at DESC);

CREATE INDEX IF NOT EXISTS attendance_events_participant_idx
  ON attendance_events (participant_id, marked_at DESC);

CREATE INDEX IF NOT EXISTS attendance_events_enrollment_idx
  ON attendance_events (enrollment_id, marked_at DESC);

ALTER TABLE attendance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read attendance events" ON attendance_events;
CREATE POLICY "staff read attendance events"
  ON attendance_events FOR SELECT
  USING (public.is_approved_staff());

DROP POLICY IF EXISTS "admin read attendance events" ON attendance_events;
CREATE POLICY "admin read attendance events"
  ON attendance_events FOR SELECT
  USING (public.is_admin());

-- ── 3. backfill instructor_id על products ───────────────────
UPDATE products p
SET instructor_id = pr.id
FROM profiles pr
WHERE p.instructor_id IS NULL
  AND p.instructor_name IS NOT NULL
  AND pr.status = 'approved'
  AND pr.role = 'instructor'
  AND lower(trim(pr.full_name)) = lower(trim(p.instructor_name));

-- ── 4. helpers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_mark_session_attendance(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_template text;
  v_instructor_id uuid;
  v_session_date date;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT pt.code, pr.instructor_id, ss.session_date
  INTO v_template, v_instructor_id, v_session_date
  FROM scheduled_sessions ss
  JOIN products pr ON pr.id = ss.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE ss.id = p_session_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_template = 'swim_assessment' AND v_session_date = CURRENT_DATE THEN
    RETURN TRUE;
  END IF;

  RETURN v_instructor_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.can_mark_session_attendance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_mark_session_attendance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_mark_lesson_attendance(p_lesson_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_instructor_id uuid;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT instructor_id INTO v_instructor_id
  FROM lessons
  WHERE id = p_lesson_id;

  RETURN v_instructor_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.can_mark_lesson_attendance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_mark_lesson_attendance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_attendance_event(
  p_scheduled_session_id uuid,
  p_lesson_id uuid,
  p_participant_id uuid,
  p_enrollment_id uuid,
  p_child_name text,
  p_status text,
  p_source text,
  p_marked_by uuid,
  p_access_pass_id uuid,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO attendance_events (
    scheduled_session_id, lesson_id, participant_id, enrollment_id,
    child_name, status, source, marked_by, access_pass_id, notes
  ) VALUES (
    p_scheduled_session_id, p_lesson_id, p_participant_id, p_enrollment_id,
    p_child_name, p_status, p_source, p_marked_by, p_access_pass_id, p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_attendance_event(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.apply_guard_scan_attendance(
  p_session_id uuid,
  p_enrollment_id uuid,
  p_participant_id uuid,
  p_child_name text,
  p_pass_id uuid,
  p_marked_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
  v_source text;
BEGIN
  SELECT attendance_status, attendance_source
  INTO v_current, v_source
  FROM session_attendees
  WHERE session_id = p_session_id AND enrollment_id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_current = 'absent' AND v_source = 'instructor' THEN
    RETURN;
  END IF;

  IF v_current IN ('pending', 'present') OR v_current IS NULL THEN
    UPDATE session_attendees
    SET
      attendance_status = 'present',
      attendance_marked_at = NOW(),
      attendance_marked_by = p_marked_by,
      attendance_source = 'guard_scan'
    WHERE session_id = p_session_id AND enrollment_id = p_enrollment_id;

    PERFORM public.log_attendance_event(
      p_session_id, NULL, p_participant_id, p_enrollment_id, p_child_name,
      'present', 'guard_scan', p_marked_by, p_pass_id, NULL
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_guard_scan_attendance(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;

-- ── 5. redeem_access_pass + lesson scan ─────────────────────
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
    'payment_status', r.payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_access_pass(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_access_pass(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_lesson_scan_attendance(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson record;
BEGIN
  SELECT id, child_name, attendance_status, attendance_source
  INTO v_lesson
  FROM lessons
  WHERE id = p_lesson_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_lesson.attendance_status = 'absent' AND v_lesson.attendance_source = 'instructor' THEN
    RETURN;
  END IF;

  IF v_lesson.attendance_status IN ('pending', 'present') THEN
    UPDATE lessons
    SET
      attendance_status = 'present',
      attendance_marked_at = NOW(),
      attendance_marked_by = auth.uid(),
      attendance_source = 'guard_scan'
    WHERE id = p_lesson_id;

    PERFORM public.log_attendance_event(
      NULL, p_lesson_id, NULL, NULL, v_lesson.child_name,
      'present', 'guard_scan', auth.uid(), NULL, NULL
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_lesson_scan_attendance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_lesson_scan_attendance(uuid) TO authenticated;

-- ── 6. RPCs למדריך ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_instructor_sessions(p_date date DEFAULT CURRENT_DATE)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.start_time, t.title), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      'group'::text AS session_type,
      ss.id AS session_id,
      ss.id AS scheduled_session_id,
      NULL::uuid AS lesson_id,
      pr.name AS title,
      pt.code AS template_code,
      ss.session_date,
      ss.start_time,
      ss.end_time,
      COUNT(sa.id)::int AS expected_count,
      COUNT(sa.id) FILTER (
        WHERE sa.attendance_status IN ('present', 'absent', 'excused', 'late')
      )::int AS marked_count
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    LEFT JOIN session_attendees sa ON sa.session_id = ss.id
    WHERE ss.session_date = p_date
      AND ss.status <> 'cancelled'
      AND (
        public.is_admin()
        OR (pt.code = 'swim_assessment' AND p_date = CURRENT_DATE)
        OR pr.instructor_id = v_uid
      )
    GROUP BY ss.id, pr.name, pt.code, ss.session_date, ss.start_time, ss.end_time

    UNION ALL

    SELECT
      'private'::text AS session_type,
      l.id AS session_id,
      NULL::uuid AS scheduled_session_id,
      l.id AS lesson_id,
      l.child_name AS title,
      'private_lesson'::text AS template_code,
      l.lesson_date AS session_date,
      l.start_time,
      l.end_time,
      1 AS expected_count,
      CASE WHEN l.attendance_status IN ('present', 'absent', 'excused', 'late') THEN 1 ELSE 0 END AS marked_count
    FROM lessons l
    WHERE l.lesson_date = p_date
      AND NOT l.cancelled
      AND (public.is_admin() OR l.instructor_id = v_uid)
  ) t;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.list_instructor_sessions(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_instructor_sessions(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_session_attendance_roster(p_session_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.can_mark_session_attendance(p_session_id) THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.child_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      sa.id AS attendee_id,
      sa.enrollment_id,
      sa.participant_id,
      p.full_name AS child_name,
      sa.attendance_status,
      sa.attendance_source
    FROM session_attendees sa
    JOIN participants p ON p.id = sa.participant_id
    WHERE sa.session_id = p_session_id
  ) t;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_attendance_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_attendance_roster(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_lesson_attendance(p_lesson_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson record;
BEGIN
  IF NOT public.can_mark_lesson_attendance(p_lesson_id) THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT id, child_name, attendance_status, attendance_source, lesson_date, start_time
  INTO v_lesson
  FROM lessons
  WHERE id = p_lesson_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'lesson_id', v_lesson.id,
    'child_name', v_lesson.child_name,
    'attendance_status', v_lesson.attendance_status,
    'attendance_source', v_lesson.attendance_source,
    'session_date', v_lesson.lesson_date,
    'start_time', v_lesson.start_time
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_lesson_attendance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_attendance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_session_attendance(
  p_session_id uuid,
  p_marks jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mark jsonb;
  v_enrollment_id uuid;
  v_status text;
  v_notes text;
  v_participant_id uuid;
  v_child_name text;
  v_updated int := 0;
BEGIN
  IF NOT public.can_mark_session_attendance(p_session_id) THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  FOR v_mark IN SELECT * FROM jsonb_array_elements(p_marks)
  LOOP
    v_enrollment_id := (v_mark->>'enrollment_id')::uuid;
    v_status := v_mark->>'status';
    v_notes := NULLIF(v_mark->>'notes', '');

    IF v_status NOT IN ('present', 'absent', 'excused', 'late') THEN
      CONTINUE;
    END IF;

    SELECT sa.participant_id, p.full_name
    INTO v_participant_id, v_child_name
    FROM session_attendees sa
    JOIN participants p ON p.id = sa.participant_id
    WHERE sa.session_id = p_session_id AND sa.enrollment_id = v_enrollment_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE session_attendees
    SET
      attendance_status = v_status,
      attendance_marked_at = NOW(),
      attendance_marked_by = auth.uid(),
      attendance_source = 'instructor'
    WHERE session_id = p_session_id AND enrollment_id = v_enrollment_id;

    PERFORM public.log_attendance_event(
      p_session_id, NULL, v_participant_id, v_enrollment_id, v_child_name,
      v_status, 'instructor', auth.uid(), NULL, v_notes
    );

    v_updated := v_updated + 1;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_session_attendance(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_session_attendance(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_lesson_attendance(
  p_lesson_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_name text;
BEGIN
  IF NOT public.can_mark_lesson_attendance(p_lesson_id) THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_status NOT IN ('present', 'absent', 'excused', 'late') THEN
    RETURN json_build_object('result', 'invalid_status');
  END IF;

  SELECT child_name INTO v_child_name FROM lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  UPDATE lessons
  SET
    attendance_status = p_status,
    attendance_marked_at = NOW(),
    attendance_marked_by = auth.uid(),
    attendance_source = 'instructor'
  WHERE id = p_lesson_id;

  PERFORM public.log_attendance_event(
    NULL, p_lesson_id, NULL, NULL, v_child_name,
    p_status, 'instructor', auth.uid(), NULL, p_notes
  );

  RETURN json_build_object('result', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_lesson_attendance(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lesson_attendance(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_attendance_history(
  p_from date,
  p_to date,
  p_product_id uuid DEFAULT NULL,
  p_participant_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.marked_at DESC), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      ae.id,
      ae.marked_at,
      ae.status,
      ae.source,
      ae.child_name,
      ae.notes,
      COALESCE(p.full_name, ae.child_name) AS participant_name,
      pr.name AS product_name,
      pt.code AS template_code,
      COALESCE(ss.session_date, l.lesson_date) AS session_date,
      COALESCE(ss.start_time, l.start_time) AS start_time
    FROM attendance_events ae
    LEFT JOIN participants p ON p.id = ae.participant_id
    LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
    LEFT JOIN lessons l ON l.id = ae.lesson_id
    LEFT JOIN products pr ON pr.id = ss.product_id
    LEFT JOIN product_templates pt ON pt.id = pr.template_id
    WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to
      AND (p_product_id IS NULL OR pr.id = p_product_id)
      AND (p_participant_id IS NULL OR ae.participant_id = p_participant_id)
  ) t;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.list_attendance_history(date, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_attendance_history(date, date, uuid, uuid) TO authenticated;

-- ── 7. RLS — מדריך יכול לעדכן נוכחות ───────────────────────
DROP POLICY IF EXISTS "instructor update session attendees attendance" ON session_attendees;
CREATE POLICY "instructor update session attendees attendance"
  ON session_attendees FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM scheduled_sessions ss
      JOIN products pr ON pr.id = ss.product_id
      JOIN product_templates pt ON pt.id = pr.template_id
      WHERE ss.id = session_attendees.session_id
        AND (
          pr.instructor_id = auth.uid()
          OR (pt.code = 'swim_assessment' AND ss.session_date = CURRENT_DATE)
        )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM scheduled_sessions ss
      JOIN products pr ON pr.id = ss.product_id
      JOIN product_templates pt ON pt.id = pr.template_id
      WHERE ss.id = session_attendees.session_id
        AND (
          pr.instructor_id = auth.uid()
          OR (pt.code = 'swim_assessment' AND ss.session_date = CURRENT_DATE)
        )
    )
  );

DROP POLICY IF EXISTS "instructor update lesson attendance" ON lessons;
CREATE POLICY "instructor update lesson attendance"
  ON lessons FOR UPDATE
  USING (
    public.is_instructor_or_admin()
    AND (public.is_admin() OR instructor_id = auth.uid())
  )
  WITH CHECK (
    public.is_instructor_or_admin()
    AND (public.is_admin() OR instructor_id = auth.uid())
  );

SELECT 'Stream Line OS stage 5 attendance migration complete' AS status;
