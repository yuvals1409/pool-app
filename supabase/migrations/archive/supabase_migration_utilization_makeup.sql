-- ============================================================
--  MIGRATION: ניצול חבילה + השלמות
-- ============================================================

-- ── 1. סכימה ───────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS level_label TEXT;

ALTER TABLE session_attendees
  ADD COLUMN IF NOT EXISTS attendee_type TEXT NOT NULL DEFAULT 'regular'
    CHECK (attendee_type IN ('regular', 'makeup'));

CREATE TABLE IF NOT EXISTS makeup_bookings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id               UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  source_session_attendee_id  UUID REFERENCES session_attendees(id) ON DELETE SET NULL,
  target_session_id           UUID NOT NULL REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
  session_attendee_id         UUID REFERENCES session_attendees(id) ON DELETE SET NULL,
  booked_by                   UUID REFERENCES profiles(id),
  status                      TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at                TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS makeup_bookings_active_target_idx
  ON makeup_bookings (enrollment_id, target_session_id)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS makeup_bookings_enrollment_idx
  ON makeup_bookings (enrollment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS makeup_bookings_target_session_idx
  ON makeup_bookings (target_session_id);

ALTER TABLE makeup_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manage makeup bookings" ON makeup_bookings;
CREATE POLICY "admin manage makeup bookings"
  ON makeup_bookings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "staff read makeup bookings" ON makeup_bookings;
CREATE POLICY "staff read makeup bookings"
  ON makeup_bookings FOR SELECT
  USING (public.is_approved_staff());

-- ── 2. ניצול חבילה ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_enrollment_utilization(
  p_enrollment_id uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_enrollment record;
  v_entitled integer;
  v_utilized integer;
  v_makeup_scheduled integer;
  v_sessions json;
BEGIN
  IF NOT public.is_admin_or_office() AND NOT public.is_instructor_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT e.id, e.valid_from, e.valid_until, e.active, e.product_id
  INTO v_enrollment
  FROM enrollments e
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  SELECT COUNT(*)::int INTO v_entitled
  FROM session_attendees sa
  JOIN scheduled_sessions ss ON ss.id = sa.session_id
  WHERE sa.enrollment_id = p_enrollment_id
    AND sa.attendee_type = 'regular'
    AND ss.session_date <= p_as_of
    AND ss.status != 'cancelled'
    AND ss.session_date >= v_enrollment.valid_from
    AND ss.session_date <= v_enrollment.valid_until;

  SELECT COUNT(*)::int INTO v_utilized
  FROM (
    SELECT sa.id
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    WHERE sa.enrollment_id = p_enrollment_id
      AND sa.attendee_type = 'regular'
      AND ss.session_date <= p_as_of
      AND ss.status != 'cancelled'
      AND ss.session_date >= v_enrollment.valid_from
      AND ss.session_date <= v_enrollment.valid_until
      AND sa.attendance_status IN ('present', 'late')
    UNION
    SELECT sa.id
    FROM makeup_bookings mb
    JOIN session_attendees sa ON sa.id = mb.session_attendee_id
    JOIN scheduled_sessions ss ON ss.id = mb.target_session_id
    WHERE mb.enrollment_id = p_enrollment_id
      AND mb.status != 'cancelled'
      AND ss.session_date <= p_as_of
      AND sa.attendance_status IN ('present', 'late')
  ) utilized_rows;

  SELECT COUNT(*)::int INTO v_makeup_scheduled
  FROM makeup_bookings mb
  JOIN scheduled_sessions ss ON ss.id = mb.target_session_id
  WHERE mb.enrollment_id = p_enrollment_id
    AND mb.status = 'scheduled'
    AND ss.session_date >= CURRENT_DATE;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.session_date, t.start_time), '[]'::json)
  INTO v_sessions
  FROM (
    SELECT
      sa.id AS attendee_id,
      ss.id AS session_id,
      ss.session_date,
      ss.start_time,
      sa.attendance_status,
      sa.attendee_type,
      FALSE AS is_makeup,
      p.name AS product_name,
      NULL::uuid AS makeup_booking_id
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN products p ON p.id = ss.product_id
    WHERE sa.enrollment_id = p_enrollment_id
      AND sa.attendee_type = 'regular'
      AND ss.session_date <= p_as_of
      AND ss.status != 'cancelled'
      AND ss.session_date >= v_enrollment.valid_from
      AND ss.session_date <= v_enrollment.valid_until
    UNION ALL
    SELECT
      sa.id AS attendee_id,
      ss.id AS session_id,
      ss.session_date,
      ss.start_time,
      sa.attendance_status,
      sa.attendee_type,
      TRUE AS is_makeup,
      p.name AS product_name,
      mb.id AS makeup_booking_id
    FROM makeup_bookings mb
    JOIN session_attendees sa ON sa.id = mb.session_attendee_id
    JOIN scheduled_sessions ss ON ss.id = mb.target_session_id
    JOIN products p ON p.id = ss.product_id
    WHERE mb.enrollment_id = p_enrollment_id
      AND mb.status IN ('scheduled', 'completed', 'no_show')
      AND ss.session_date <= p_as_of
  ) t;

  RETURN json_build_object(
    'result', 'ok',
    'enrollment_id', p_enrollment_id,
    'as_of', p_as_of,
    'entitled', v_entitled,
    'utilized', v_utilized,
    'shortfall', GREATEST(v_entitled - v_utilized, 0),
    'makeup_scheduled', v_makeup_scheduled,
    'sessions', v_sessions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_enrollment_utilization(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_enrollment_utilization(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_utilization_report(
  p_as_of date DEFAULT CURRENT_DATE,
  p_season_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_template_code text DEFAULT NULL,
  p_min_shortfall integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.shortfall DESC, t.child_name)
      FROM (
        SELECT
          e.id AS enrollment_id,
          p_part.id AS participant_id,
          p_part.full_name AS child_name,
          f.phone AS parent_phone,
          f.parent_name,
          pr.id AS product_id,
          pr.name AS product_name,
          pr.level_label,
          pt.code AS template_code,
          s.id AS season_id,
          s.name AS season_name,
          (util->>'entitled')::int AS entitled,
          (util->>'utilized')::int AS utilized,
          (util->>'shortfall')::int AS shortfall,
          (util->>'makeup_scheduled')::int AS makeup_scheduled
        FROM enrollments e
        JOIN participants p_part ON p_part.id = e.participant_id
        JOIN families f ON f.id = p_part.family_id
        JOIN products pr ON pr.id = e.product_id
        JOIN product_templates pt ON pt.id = pr.template_id
        JOIN seasons s ON s.id = pr.season_id
        CROSS JOIN LATERAL public.get_enrollment_utilization(e.id, p_as_of) util
        WHERE e.active = TRUE
          AND pt.code IN ('annual_section', 'summer_course')
          AND (p_season_id IS NULL OR s.id = p_season_id)
          AND (p_product_id IS NULL OR pr.id = p_product_id)
          AND (p_template_code IS NULL OR pt.code = p_template_code)
          AND (util->>'shortfall')::int >= COALESCE(p_min_shortfall, 0)
      ) t
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_utilization_report(date, uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_utilization_report(date, uuid, uuid, text, integer) TO authenticated;

-- ── 3. השלמות ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_makeup_target_sessions(
  p_enrollment_id uuid,
  p_from date DEFAULT CURRENT_DATE,
  p_to date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_enrollment record;
  v_home_level text;
  v_to date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT e.*, pr.season_id, pr.level_label AS home_level
  INTO v_enrollment
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  WHERE e.id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  v_home_level := v_enrollment.home_level;
  v_to := COALESCE(p_to, v_enrollment.valid_until);

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.level_match DESC, t.session_date, t.start_time)
      FROM (
        SELECT
          ss.id AS session_id,
          ss.session_date,
          ss.start_time,
          ss.end_time,
          pr.id AS product_id,
          pr.name AS product_name,
          pr.level_label,
          pr.instructor_name,
          pt.code AS template_code,
          (
            SELECT COUNT(*)::int
            FROM session_attendees sa2
            WHERE sa2.session_id = ss.id
          ) AS attendee_count,
          pr.capacity,
          CASE
            WHEN v_home_level IS NOT NULL
              AND pr.level_label IS NOT NULL
              AND lower(trim(pr.level_label)) = lower(trim(v_home_level))
            THEN 1
            ELSE 0
          END AS level_match,
          EXISTS (
            SELECT 1 FROM session_attendees sa3
            WHERE sa3.session_id = ss.id
              AND sa3.enrollment_id = p_enrollment_id
          ) AS already_booked
        FROM scheduled_sessions ss
        JOIN products pr ON pr.id = ss.product_id
        JOIN product_templates pt ON pt.id = pr.template_id
        WHERE pr.season_id = v_enrollment.season_id
          AND pt.code IN ('annual_section', 'summer_course')
          AND ss.status = 'scheduled'
          AND ss.session_date BETWEEN p_from AND v_to
          AND pr.id != v_enrollment.product_id
      ) t
      WHERE NOT t.already_booked
        AND (t.capacity IS NULL OR t.attendee_count < t.capacity)
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_makeup_target_sessions(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_makeup_target_sessions(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.book_makeup_session(
  p_enrollment_id uuid,
  p_target_session_id uuid,
  p_source_session_attendee_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment record;
  v_session record;
  v_attendee_id uuid;
  v_booking_id uuid;
  v_pass_id uuid;
  v_public_token uuid;
  v_attendee_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT e.*, p_part.id AS pid
  INTO v_enrollment
  FROM enrollments e
  JOIN participants p_part ON p_part.id = e.participant_id
  WHERE e.id = p_enrollment_id AND e.active = TRUE;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'enrollment_not_found');
  END IF;

  SELECT ss.*, pr.capacity, pr.name AS product_name
  INTO v_session
  FROM scheduled_sessions ss
  JOIN products pr ON pr.id = ss.product_id
  WHERE ss.id = p_target_session_id AND ss.status = 'scheduled';

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'session_not_found');
  END IF;

  IF v_session.session_date < CURRENT_DATE THEN
    RETURN json_build_object('result', 'session_past');
  END IF;

  IF EXISTS (
    SELECT 1 FROM session_attendees
    WHERE session_id = p_target_session_id AND enrollment_id = p_enrollment_id
  ) THEN
    RETURN json_build_object('result', 'already_booked');
  END IF;

  IF v_session.capacity IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_attendee_count
    FROM session_attendees WHERE session_id = p_target_session_id;
    IF v_attendee_count >= v_session.capacity THEN
      RETURN json_build_object('result', 'session_full');
    END IF;
  END IF;

  IF p_source_session_attendee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM session_attendees sa
      WHERE sa.id = p_source_session_attendee_id
        AND sa.enrollment_id = p_enrollment_id
        AND sa.attendee_type = 'regular'
    ) THEN
      RETURN json_build_object('result', 'invalid_source_session');
    END IF;
  END IF;

  INSERT INTO session_attendees (session_id, enrollment_id, participant_id, attendee_type)
  VALUES (p_target_session_id, p_enrollment_id, v_enrollment.participant_id, 'makeup')
  RETURNING id INTO v_attendee_id;

  INSERT INTO makeup_bookings (
    enrollment_id,
    source_session_attendee_id,
    target_session_id,
    session_attendee_id,
    booked_by,
    notes
  ) VALUES (
    p_enrollment_id,
    p_source_session_attendee_id,
    p_target_session_id,
    v_attendee_id,
    auth.uid(),
    NULLIF(p_notes, '')
  )
  RETURNING id INTO v_booking_id;

  PERFORM public.generate_access_passes(v_session.session_date, v_session.session_date);

  SELECT ap.id, ap.public_token
  INTO v_pass_id, v_public_token
  FROM access_passes ap
  WHERE ap.session_id = p_target_session_id
    AND ap.enrollment_id = p_enrollment_id
  ORDER BY ap.created_at DESC
  LIMIT 1;

  RETURN json_build_object(
    'result', 'ok',
    'makeup_booking_id', v_booking_id,
    'session_attendee_id', v_attendee_id,
    'access_pass_id', v_pass_id,
    'public_token', v_public_token,
    'session_date', v_session.session_date,
    'start_time', v_session.start_time,
    'product_name', v_session.product_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.book_makeup_session(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_makeup_session(uuid, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_makeup_session(p_makeup_booking_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_booking
  FROM makeup_bookings
  WHERE id = p_makeup_booking_id AND status = 'scheduled';

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  UPDATE makeup_bookings
  SET status = 'cancelled', cancelled_at = NOW()
  WHERE id = p_makeup_booking_id;

  UPDATE access_passes
  SET status = 'cancelled'
  WHERE session_id = v_booking.target_session_id
    AND enrollment_id = v_booking.enrollment_id
    AND status = 'active';

  DELETE FROM session_attendees
  WHERE id = v_booking.session_attendee_id;

  RETURN json_build_object('result', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_makeup_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_makeup_session(uuid) TO authenticated;

-- ── 4. עדכון roster + נוכחות ───────────────────────────────
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
      sa.attendance_source,
      sa.attendee_type,
      sa.attendee_type = 'makeup' AS is_makeup,
      home_pr.name AS home_product_name
    FROM session_attendees sa
    JOIN participants p ON p.id = sa.participant_id
    JOIN enrollments e ON e.id = sa.enrollment_id
    JOIN products home_pr ON home_pr.id = e.product_id
    WHERE sa.session_id = p_session_id
  ) t;

  RETURN v_rows;
END;
$$;

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
  v_attendee_type text;
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

    SELECT sa.participant_id, p.full_name, sa.attendee_type
    INTO v_participant_id, v_child_name, v_attendee_type
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

    IF v_attendee_type = 'makeup' THEN
      IF v_status IN ('present', 'late') THEN
        UPDATE makeup_bookings
        SET status = 'completed'
        WHERE session_attendee_id = (
          SELECT id FROM session_attendees
          WHERE session_id = p_session_id AND enrollment_id = v_enrollment_id
        )
          AND status = 'scheduled';
      ELSIF v_status IN ('absent', 'excused') THEN
        UPDATE makeup_bookings
        SET status = 'no_show'
        WHERE session_attendee_id = (
          SELECT id FROM session_attendees
          WHERE session_id = p_session_id AND enrollment_id = v_enrollment_id
        )
          AND status = 'scheduled';
      END IF;
    END IF;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'updated', v_updated);
END;
$$;

-- ── 5. סריקת שער → השלמה הושלמה ─────────────────────────────
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
  v_attendee_id uuid;
BEGIN
  SELECT attendance_status, attendance_source, id
  INTO v_current, v_source, v_attendee_id
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

    UPDATE makeup_bookings
    SET status = 'completed'
    WHERE session_attendee_id = v_attendee_id
      AND status = 'scheduled';
  END IF;
END;
$$;
