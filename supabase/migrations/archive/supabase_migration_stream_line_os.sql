-- ============================================================
--  MIGRATION: Stream Line OS — שלב 1 (יסודות)
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- ── 1. הרחבת תפקידים ───────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'instructor', 'guard', 'office'));

ALTER TABLE role_assignments DROP CONSTRAINT IF EXISTS role_assignments_role_check;
ALTER TABLE role_assignments ADD CONSTRAINT role_assignments_role_check
  CHECK (role IN ('admin', 'instructor', 'guard', 'office'));

CREATE OR REPLACE FUNCTION public.is_office()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'office'
  );
$$;

REVOKE ALL ON FUNCTION public.is_office() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_office() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_or_office()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_office();
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_office() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_office() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_approved_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_approved_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_staff() TO authenticated;

-- ── 2. טבלאות חדשות ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_templates (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        TEXT NOT NULL UNIQUE,
  name                        TEXT NOT NULL,
  duration_minutes            INTEGER NOT NULL,
  entry_window_before_minutes INTEGER NOT NULL DEFAULT 30,
  entry_window_after_minutes  INTEGER NOT NULL DEFAULT 30,
  schedule_pattern            JSONB NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS families (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  email       TEXT,
  parent_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS families_phone_idx ON families (phone);

CREATE TABLE IF NOT EXISTS participants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id          UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  full_name          TEXT NOT NULL,
  birth_date         DATE,
  gender             TEXT,
  external_client_id TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS participants_family_id_idx ON participants (family_id);
CREATE INDEX IF NOT EXISTS participants_external_client_id_idx ON participants (external_client_id);

CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES product_templates(id),
  name            TEXT NOT NULL,
  day_of_week     INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  instructor_name TEXT NOT NULL,
  instructor_id   UUID REFERENCES profiles(id),
  capacity        INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'waived')),
  valid_from     DATE NOT NULL,
  valid_until    DATE NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS enrollments_active_participant_product_idx
  ON enrollments (participant_id, product_id)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS scheduled_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  status       TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_sessions_product_date_idx
  ON scheduled_sessions (product_id, session_date);

CREATE TABLE IF NOT EXISTS session_attendees (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
  enrollment_id  UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS session_attendees_session_enrollment_idx
  ON session_attendees (session_id, enrollment_id);

CREATE TABLE IF NOT EXISTS access_passes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
  enrollment_id  UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  qr_token       UUID NOT NULL DEFAULT gen_random_uuid(),
  public_token   UUID NOT NULL DEFAULT gen_random_uuid(),
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_until    TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  used_at        TIMESTAMPTZ,
  scanned_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS access_passes_qr_token_idx ON access_passes (qr_token);
CREATE UNIQUE INDEX IF NOT EXISTS access_passes_public_token_idx ON access_passes (public_token);
CREATE UNIQUE INDEX IF NOT EXISTS access_passes_session_enrollment_idx
  ON access_passes (session_id, enrollment_id);

CREATE TABLE IF NOT EXISTS access_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id    UUID NOT NULL REFERENCES access_passes(id) ON DELETE CASCADE,
  result     TEXT NOT NULL,
  reason     TEXT,
  scanned_by UUID REFERENCES profiles(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_slots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date      DATE NOT NULL,
  start_time     TIME NOT NULL,
  capacity       INTEGER NOT NULL DEFAULT 10,
  enrolled_count INTEGER NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Seed — product_templates ──────────────────────────────
INSERT INTO product_templates (
  code, name, duration_minutes,
  entry_window_before_minutes, entry_window_after_minutes,
  schedule_pattern
) VALUES
  ('annual_section', 'חוג שנתי', 45, 30, 45, '{"type":"weekly"}'),
  ('private_lesson', 'שיעור פרטי', 30, 30, 30, '{"type":"adhoc"}'),
  ('swim_assessment', 'מבדק שחייה', 30, 30, 30, '{"type":"single_slot"}'),
  ('summer_course', 'קורס קיץ', 45, 30, 45, '{"type":"course_series"}')
ON CONFLICT (code) DO NOTHING;

-- ── 4. פונקציות יצירת מפגשים וכרטיסים ─────────────────────
CREATE OR REPLACE FUNCTION public.generate_weekly_sessions(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  inserted_count integer := 0;
  r record;
  sess_id uuid;
  row_count integer;
BEGIN
  d := p_from;
  WHILE d <= p_to LOOP
    FOR r IN
      SELECT
        e.id AS enrollment_id,
        e.participant_id,
        p.id AS product_id,
        p.start_time,
        p.end_time,
        p.day_of_week
      FROM enrollments e
      JOIN products p ON p.id = e.product_id
      JOIN product_templates pt ON pt.id = p.template_id
      WHERE e.active = TRUE
        AND p.day_of_week IS NOT NULL
        AND p.day_of_week = EXTRACT(DOW FROM d)::integer
        AND d >= e.valid_from
        AND d <= e.valid_until
        AND pt.schedule_pattern->>'type' = 'weekly'
    LOOP
      sess_id := NULL;
      INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
      VALUES (r.product_id, d, r.start_time, r.end_time)
      ON CONFLICT (product_id, session_date) DO NOTHING
      RETURNING id INTO sess_id;

      IF sess_id IS NULL THEN
        SELECT id INTO sess_id
        FROM scheduled_sessions
        WHERE product_id = r.product_id AND session_date = d;
      END IF;

      INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
      VALUES (sess_id, r.enrollment_id, r.participant_id)
      ON CONFLICT (session_id, enrollment_id) DO NOTHING;

      GET DIAGNOSTICS row_count = ROW_COUNT;
      IF row_count > 0 THEN
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
    d := d + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_weekly_sessions(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_weekly_sessions(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_access_passes(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
  r record;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  row_count integer;
BEGIN
  FOR r IN
    SELECT
      sa.session_id,
      sa.enrollment_id,
      sa.participant_id,
      ss.session_date,
      ss.start_time,
      pt.duration_minutes,
      pt.entry_window_before_minutes,
      pt.entry_window_after_minutes
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN products p ON p.id = ss.product_id
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE ss.session_date BETWEEN p_from AND p_to
      AND ss.status = 'scheduled'
  LOOP
    v_valid_from := (r.session_date + r.start_time)
      - make_interval(mins => r.entry_window_before_minutes);
    v_valid_until := (r.session_date + r.start_time)
      + make_interval(mins => r.duration_minutes + r.entry_window_after_minutes);

    INSERT INTO access_passes (
      session_id, enrollment_id, participant_id, valid_from, valid_until
    ) VALUES (
      r.session_id, r.enrollment_id, r.participant_id, v_valid_from, v_valid_until
    )
    ON CONFLICT (session_id, enrollment_id) DO NOTHING;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    IF row_count > 0 THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_access_passes(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_access_passes(date, date) TO authenticated;

-- ── 5. RLS ─────────────────────────────────────────────────
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read seasons"
  ON seasons FOR SELECT
  USING (public.is_approved_staff());

CREATE POLICY "admin office manage seasons"
  ON seasons FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

CREATE POLICY "staff read product templates"
  ON product_templates FOR SELECT
  USING (public.is_approved_staff());

CREATE POLICY "admin manage product templates"
  ON product_templates FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin office read families"
  ON families FOR SELECT
  USING (public.is_admin_or_office());

CREATE POLICY "admin office manage families"
  ON families FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

CREATE POLICY "admin office read participants"
  ON participants FOR SELECT
  USING (public.is_admin_or_office());

CREATE POLICY "admin office manage participants"
  ON participants FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

CREATE POLICY "staff read products"
  ON products FOR SELECT
  USING (public.is_approved_staff());

CREATE POLICY "admin office manage products"
  ON products FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

CREATE POLICY "admin office read enrollments"
  ON enrollments FOR SELECT
  USING (public.is_admin_or_office());

CREATE POLICY "admin office manage enrollments"
  ON enrollments FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

CREATE POLICY "staff read scheduled sessions"
  ON scheduled_sessions FOR SELECT
  USING (public.is_approved_staff());

CREATE POLICY "admin manage scheduled sessions"
  ON scheduled_sessions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "staff read session attendees"
  ON session_attendees FOR SELECT
  USING (public.is_approved_staff());

CREATE POLICY "admin manage session attendees"
  ON session_attendees FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "public read access pass by token"
  ON access_passes FOR SELECT
  USING (true);

CREATE POLICY "guard office admin update access passes"
  ON access_passes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND status = 'approved'
        AND role IN ('guard', 'office', 'admin')
    )
  );

CREATE POLICY "admin insert access passes"
  ON access_passes FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "staff read access logs"
  ON access_logs FOR SELECT
  USING (public.is_approved_staff());

CREATE POLICY "guard office admin insert access logs"
  ON access_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND status = 'approved'
        AND role IN ('guard', 'office', 'admin')
    )
  );

CREATE POLICY "public read active assessment slots"
  ON assessment_slots FOR SELECT
  USING (active = TRUE);

CREATE POLICY "admin manage assessment slots"
  ON assessment_slots FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 6. Cron (אופציונלי — רק אם pg_cron מותקן) ───────────────
DO $cron$
DECLARE
  jid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'stream_line_weekly_sessions'
    LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;

    PERFORM cron.schedule(
      'stream_line_weekly_sessions',
      '0 6 * * 0',
      $job$
        SELECT public.generate_weekly_sessions(CURRENT_DATE, CURRENT_DATE + 7);
        SELECT public.generate_access_passes(CURRENT_DATE, CURRENT_DATE + 7);
      $job$
    );
  END IF;
END;
$cron$;

SELECT 'Stream Line OS migration complete' AS status;
