-- ============================================================
--  BASELINE MIGRATION — Stream Line (pool-app)
--  Generated from supabase/legacy/supabase_setup.sql + archive/
--  For fresh environments: supabase db reset
--  Production (already migrated): see supabase/README.md
-- ============================================================

-- ============================================================
--  POOL APP — SUPABASE SETUP SCRIPT
--  הרץ את כל זה ב-SQL Editor ב-Supabase (פעם אחת)
-- ============================================================

-- ── 1. PROFILES TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT CHECK (role IN ('admin','instructor','guard')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 1b. ROLE ASSIGNMENTS (הזמנה לפי מייל לפני התחברות) ───
CREATE TABLE IF NOT EXISTS role_assignments (
  email       TEXT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('admin','instructor','guard')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own role assignment"
  ON role_assignments FOR SELECT
  USING (lower(email) = lower((auth.jwt() ->> 'email')));

CREATE POLICY "admins manage role assignments"
  ON role_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 2. LESSONS TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_name      TEXT NOT NULL,
  lesson_date     DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  instructor_name TEXT NOT NULL,
  instructor_id   UUID REFERENCES profiles(id),
  parent_phone    TEXT,
  qr_token        UUID NOT NULL DEFAULT gen_random_uuid(),
  used            BOOLEAN DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  cancelled       BOOLEAN DEFAULT FALSE,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lessons_qr_token_idx ON lessons (qr_token);

-- ── 2b. RECURRING LESSONS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_name      TEXT NOT NULL,
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      TIME NOT NULL,
  instructor_name TEXT NOT NULL,
  instructor_id   UUID REFERENCES profiles(id),
  parent_phone    TEXT NOT NULL,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS recurring_lesson_id UUID REFERENCES recurring_lessons(id);
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS lessons_recurring_date_idx
  ON lessons (recurring_lesson_id, lesson_date)
  WHERE recurring_lesson_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_weekly_recurring_lessons()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  week_start date;
  target_date date;
  inserted_count integer := 0;
BEGIN
  week_start := CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::integer;
  FOR r IN SELECT * FROM recurring_lessons WHERE active = true LOOP
    target_date := week_start + r.day_of_week;
    IF target_date >= CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM lessons l
         WHERE l.recurring_lesson_id = r.id AND l.lesson_date = target_date
       ) THEN
      INSERT INTO lessons (
        child_name, lesson_date, start_time, end_time,
        instructor_name, instructor_id, parent_phone, recurring_lesson_id
      ) VALUES (
        r.child_name, target_date, r.start_time, r.start_time,
        r.instructor_name, r.instructor_id, r.parent_phone, r.id
      );
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_weekly_recurring_lessons() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_weekly_recurring_lessons() TO authenticated;

-- ── 3. ROW LEVEL SECURITY ──────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approved read recurring lessons"
  ON recurring_lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS "instructor manage own recurring lessons" ON recurring_lessons;
CREATE POLICY "instructor manage own recurring lessons"
  ON recurring_lessons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'approved'
        AND (
          p.role = 'admin'
          OR (p.role = 'instructor' AND recurring_lessons.instructor_id = auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'approved'
        AND (
          p.role = 'admin'
          OR (p.role = 'instructor' AND instructor_id = auth.uid())
        )
    )
  );

-- profiles: כל משתמש מחובר יכול לקרוא ולשנות פרופיל שלו
-- מנהל (מזוהה לפי ה-email שהגדרת) יכול לקרוא הכל ולעדכן הכל
CREATE POLICY "users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- פונקציה שעוקפת RLS כדי למנוע רקורסיה אינסופית במדיניות admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- admin יכול לראות ולשנות כל פרופיל
CREATE POLICY "admin full access on profiles"
  ON profiles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- lessons: משתמש מאושר יכול לקרוא
CREATE POLICY "approved users read lessons"
  ON lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'approved'
    )
  );

-- מדריך או מנהל יכול ליצור שיעור
CREATE POLICY "instructor or admin create lesson"
  ON lessons FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND status = 'approved'
        AND role IN ('instructor','admin')
    )
  );

-- שומר או מנהל יכול לעדכן שיעור (סימון כ-used)
CREATE POLICY "guard or admin update lesson"
  ON lessons FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND status = 'approved'
        AND role IN ('guard','admin')
    )
  );

-- מדריך או מנהל יכול לעדכן שיעור (ביטול, עריכה)
CREATE POLICY "instructor or admin update lesson details"
  ON lessons FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND status = 'approved'
        AND role IN ('instructor','admin')
    )
  );

-- הורים (לא מחוברים) יכולים לקרוא שיעור לפי UUID — לדף הכרטיס
-- נשתמש ב-anon read רק ל-lessons (לא לפרופילים)
CREATE POLICY "public read lesson by id"
  ON lessons FOR SELECT
  USING (true);  -- כל UUID תקין ניתן לקריאה — הסוד הוא ה-UUID עצמו

-- ── 4. AUTO-PROFILE TRIGGER ────────────────────────────────
-- אם תרצה לייצר פרופיל אוטומטי בהרשמה (אופציונלי — האפליקציה עושה זאת)
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS trigger AS $$
-- BEGIN
--   INSERT INTO public.profiles (id, email, full_name, avatar_url)
--   VALUES (
--     new.id,
--     new.email,
--     new.raw_user_meta_data->>'full_name',
--     new.raw_user_meta_data->>'avatar_url'
--   );
--   RETURN new;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
--
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 5. VERIFY ──────────────────────────────────────────────
SELECT 'Setup complete ✓' AS status;


-- ── supabase_migration_stream_line_os.sql ──

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


-- ── supabase_migration_stream_line_os_stage2.sql ──

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


-- ── supabase_migration_stream_line_os_stage3.sql ──

-- ============================================================
--  MIGRATION: Stream Line OS — שלב 3 (ימים 8–9)
--  מבדק שחייה: לידים, RPC הרשמה ציבורית, sync מפגשים
-- ============================================================

ALTER TABLE assessment_slots
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES scheduled_sessions(id);

CREATE TABLE IF NOT EXISTS assessment_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         UUID NOT NULL REFERENCES assessment_slots(id) ON DELETE CASCADE,
  enrollment_id   UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  participant_id  UUID REFERENCES participants(id) ON DELETE SET NULL,
  child_age       INTEGER,
  status          TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'converted', 'cancelled')),
  source          TEXT NOT NULL DEFAULT 'web',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assessment_leads_slot_id_idx ON assessment_leads (slot_id);
CREATE INDEX IF NOT EXISTS assessment_leads_status_idx ON assessment_leads (status);

ALTER TABLE assessment_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read assessment leads"
  ON assessment_leads FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin manage assessment leads"
  ON assessment_leads FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── מוצר מבדק לעונה הפעילה ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_assessment_product()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid;
  v_template_id uuid;
  v_product_id uuid;
BEGIN
  SELECT id INTO v_season_id
  FROM seasons
  WHERE active = TRUE
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'no_active_season';
  END IF;

  SELECT id INTO v_template_id
  FROM product_templates
  WHERE code = 'swim_assessment';

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'swim_assessment_template_missing';
  END IF;

  SELECT id INTO v_product_id
  FROM products
  WHERE season_id = v_season_id
    AND template_id = v_template_id
  LIMIT 1;

  IF v_product_id IS NOT NULL THEN
    RETURN v_product_id;
  END IF;

  INSERT INTO products (
    season_id, template_id, name,
    day_of_week, start_time, end_time, instructor_name
  ) VALUES (
    v_season_id, v_template_id, 'מבדק שחייה',
    NULL, '16:00', '16:30', 'מבדק'
  )
  RETURNING id INTO v_product_id;

  RETURN v_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_assessment_product() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_assessment_product() TO authenticated;

-- ── יצירת מפגש למועד מבדק ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_assessment_slot_session(p_slot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_product_id uuid;
  v_session_id uuid;
  v_end_time time;
BEGIN
  SELECT * INTO v_slot
  FROM assessment_slots
  WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found';
  END IF;

  IF v_slot.session_id IS NOT NULL THEN
    RETURN v_slot.session_id;
  END IF;

  v_product_id := public.ensure_assessment_product();
  v_end_time := (v_slot.start_time + interval '30 minutes')::time;

  INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
  VALUES (v_product_id, v_slot.slot_date, v_slot.start_time, v_end_time)
  ON CONFLICT (product_id, session_date) DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM scheduled_sessions
    WHERE product_id = v_product_id
      AND session_date = v_slot.slot_date;
  END IF;

  UPDATE assessment_slots
  SET session_id = v_session_id
  WHERE id = p_slot_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_assessment_slot_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_assessment_slot_session(uuid) TO authenticated;

-- ── רשימת מועדים פנויים (ציבורי) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.list_assessment_slots()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.slot_date, t.start_time)
      FROM (
        SELECT
          id,
          slot_date,
          start_time,
          capacity,
          enrolled_count,
          (capacity - enrolled_count) AS spots_left
        FROM assessment_slots
        WHERE active = TRUE
          AND slot_date >= CURRENT_DATE
          AND enrolled_count < capacity
        ORDER BY slot_date, start_time
      ) t
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_assessment_slots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assessment_slots() TO anon, authenticated;

-- ── הרשמה למבדק (ציבורי) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_assessment(
  p_slot_id uuid,
  p_child_name text,
  p_child_age integer,
  p_parent_name text,
  p_phone text
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
BEGIN
  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));

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
    p_slot_id, v_enrollment_id, v_participant_id, p_child_age, 'new', 'web'
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

REVOKE ALL ON FUNCTION public.register_assessment(uuid, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_assessment(uuid, text, integer, text, text) TO anon, authenticated;

SELECT 'Stream Line OS stage 3 migration complete' AS status;


-- ── supabase_migration_stream_line_os_stage4.sql ──

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


-- ── supabase_migration_stream_line_os_stage5_attendance.sql ──

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


-- ── supabase_migration_stream_line_os_stage6.sql ──

-- ============================================================
--  Stream Line OS — stage 6
--  מבדק multi-slot, ברקוד חמישי, analytics, sheet sync tables
-- ============================================================

-- ── 1. מבדק: מספר מועדים באותו יום ─────────────────────────
DROP INDEX IF EXISTS scheduled_sessions_product_date_idx;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_sessions_product_date_time_idx
  ON scheduled_sessions (product_id, session_date, start_time);

CREATE OR REPLACE FUNCTION public.sync_assessment_slot_session(p_slot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_product_id uuid;
  v_session_id uuid;
  v_end_time time;
BEGIN
  SELECT * INTO v_slot
  FROM assessment_slots
  WHERE id = p_slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found';
  END IF;

  IF v_slot.session_id IS NOT NULL THEN
    RETURN v_slot.session_id;
  END IF;

  v_product_id := public.ensure_assessment_product();
  v_end_time := (v_slot.start_time + interval '30 minutes')::time;

  INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
  VALUES (v_product_id, v_slot.slot_date, v_slot.start_time, v_end_time)
  ON CONFLICT (product_id, session_date, start_time) DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT id INTO v_session_id
    FROM scheduled_sessions
    WHERE product_id = v_product_id
      AND session_date = v_slot.slot_date
      AND start_time = v_slot.start_time;
  END IF;

  UPDATE assessment_slots
  SET session_id = v_session_id
  WHERE id = p_slot_id;

  RETURN v_session_id;
END;
$$;

-- ── 2. ברקוד שבועי — חמישי, שבוע הבא ─────────────────────
CREATE OR REPLACE FUNCTION public.get_next_week_bounds(p_reference date DEFAULT CURRENT_DATE)
RETURNS TABLE(week_start date, week_end date)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (p_reference + ((7 - EXTRACT(DOW FROM p_reference)::int) % 7))::date AS week_start,
    (p_reference + ((7 - EXTRACT(DOW FROM p_reference)::int) % 7) + 6)::date AS week_end;
$$;

CREATE OR REPLACE FUNCTION public.generate_weekly_recurring_lessons(p_target_week_start date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  week_start date;
  target_date date;
  inserted_count integer := 0;
BEGIN
  week_start := COALESCE(
    p_target_week_start,
    CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::integer
  );

  FOR r IN SELECT * FROM recurring_lessons WHERE active = true LOOP
    target_date := week_start + r.day_of_week;

    IF NOT EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.recurring_lesson_id = r.id
        AND l.lesson_date = target_date
    ) THEN
      INSERT INTO lessons (
        child_name, lesson_date, start_time, end_time,
        instructor_name, instructor_id, parent_phone,
        recurring_lesson_id
      ) VALUES (
        r.child_name, target_date, r.start_time,
        (r.start_time + interval '30 minutes')::time,
        r.instructor_name, r.instructor_id, r.parent_phone,
        r.id
      );
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_upcoming_week_passes()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_to date;
  v_sessions integer;
  v_passes integer;
  v_lessons integer;
BEGIN
  SELECT week_start, week_end INTO v_from, v_to
  FROM public.get_next_week_bounds(CURRENT_DATE);

  v_sessions := public.generate_weekly_sessions(v_from, v_to);
  v_passes := public.generate_access_passes(v_from, v_to);
  v_lessons := public.generate_weekly_recurring_lessons(v_from);

  RETURN json_build_object(
    'week_start', v_from,
    'week_end', v_to,
    'sessions_created', v_sessions,
    'passes_created', v_passes,
    'recurring_lessons_created', v_lessons
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_week_bounds(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_week_bounds(date) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_weekly_recurring_lessons(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_weekly_recurring_lessons(date) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_upcoming_week_passes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_upcoming_week_passes() TO authenticated;

DO $cron$
DECLARE
  jid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR jid IN SELECT jobid FROM cron.job
      WHERE jobname IN ('stream_line_weekly_sessions', 'generate-weekly-recurring-lessons')
    LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;

    PERFORM cron.schedule(
      'stream_line_weekly_sessions',
      '0 6 * * 4',
      $job$SELECT public.generate_upcoming_week_passes();$job$
    );
  END IF;
END;
$cron$;

-- ── 3. Sheet sync tables ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sheet_sync_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction    TEXT NOT NULL CHECK (direction IN ('pull', 'push', 'both')),
  sheet_tab    TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  rows_in      INTEGER NOT NULL DEFAULT 0,
  rows_out     INTEGER NOT NULL DEFAULT 0,
  errors       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'ok', 'partial', 'failed'))
);

CREATE TABLE IF NOT EXISTS sheet_row_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_tab    TEXT NOT NULL,
  row_key      TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  content_hash TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sheet_tab, row_key)
);

CREATE INDEX IF NOT EXISTS sheet_row_links_entity_idx
  ON sheet_row_links (entity_type, entity_id);

ALTER TABLE sheet_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_row_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read sheet sync runs"
  ON sheet_sync_runs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin manage sheet sync runs"
  ON sheet_sync_runs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin read sheet row links"
  ON sheet_row_links FOR SELECT
  USING (public.is_admin());

CREATE POLICY "admin manage sheet row links"
  ON sheet_row_links FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 4. Analytics RPCs ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_from date, p_to date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_total_sessions integer;
  v_marked integer;
  v_present integer;
  v_scan integer;
  v_instructor integer;
  v_unpaid integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*) INTO v_total_sessions
  FROM scheduled_sessions ss
  WHERE ss.session_date BETWEEN p_from AND p_to
    AND ss.status <> 'cancelled';

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE ae.status = 'present'),
    COUNT(*) FILTER (WHERE ae.source = 'guard_scan'),
    COUNT(*) FILTER (WHERE ae.source = 'instructor')
  INTO v_marked, v_present, v_scan, v_instructor
  FROM attendance_events ae
  LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
  LEFT JOIN lessons l ON l.id = ae.lesson_id
  WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to;

  SELECT COUNT(*) INTO v_unpaid
  FROM enrollments
  WHERE active = TRUE AND payment_status = 'unpaid';

  RETURN json_build_object(
    'total_sessions', v_total_sessions,
    'attendance_events', v_marked,
    'present_count', v_present,
    'attendance_rate', CASE WHEN v_marked > 0 THEN ROUND(100.0 * v_present / v_marked, 1) ELSE 0 END,
    'scan_marks', v_scan,
    'instructor_marks', v_instructor,
    'unpaid_enrollments', v_unpaid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_by_week(
  p_from date,
  p_to date,
  p_product_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.week_start), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      date_trunc('week', COALESCE(ss.session_date, l.lesson_date))::date AS week_start,
      COUNT(*) FILTER (WHERE ae.status = 'present') AS present_count,
      COUNT(*) FILTER (WHERE ae.status = 'absent') AS absent_count,
      COUNT(*) AS total_marks,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0),
        1
      ) AS attendance_rate
    FROM attendance_events ae
    LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
    LEFT JOIN lessons l ON l.id = ae.lesson_id
    LEFT JOIN products pr ON pr.id = ss.product_id
    WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to
      AND (p_product_id IS NULL OR pr.id = p_product_id)
    GROUP BY 1
  ) t;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_by_product(p_from date, p_to date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.product_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      pr.id AS product_id,
      pr.name AS product_name,
      COUNT(*) FILTER (WHERE ae.status = 'present') AS present_count,
      COUNT(*) FILTER (WHERE ae.status = 'absent') AS absent_count,
      COUNT(*) AS total_marks,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0),
        1
      ) AS attendance_rate
    FROM attendance_events ae
    JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
    JOIN products pr ON pr.id = ss.product_id
    WHERE ss.session_date BETWEEN p_from AND p_to
    GROUP BY pr.id, pr.name
  ) t;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_enrollment_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.product_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      pr.name AS product_name,
      e.payment_status,
      COUNT(*)::int AS count
    FROM enrollments e
    JOIN products pr ON pr.id = e.product_id
    WHERE e.active = TRUE
    GROUP BY pr.name, e.payment_status
  ) t;

  RETURN v_rows;
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
  WHERE s.slot_date BETWEEN p_from AND p_to;

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
  FROM summer_invitations si
  JOIN assessment_leads al ON al.id = si.assessment_lead_id
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND si.used_at IS NOT NULL;

  RETURN json_build_object(
    'registered', v_registered,
    'passed', v_passed,
    'failed', v_failed,
    'summer_enrolled', v_summer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_summary(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_attendance_by_week(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_by_week(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_attendance_by_product(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_by_product(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_enrollment_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_enrollment_stats() TO authenticated;

REVOKE ALL ON FUNCTION public.get_assessment_funnel(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assessment_funnel(date, date) TO authenticated;

-- ── 5. עדכון generate_weekly_sessions ל-conflict חדש ───────
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
      ON CONFLICT (product_id, session_date, start_time) DO NOTHING
      RETURNING id INTO sess_id;

      IF sess_id IS NULL THEN
        SELECT id INTO sess_id
        FROM scheduled_sessions
        WHERE product_id = r.product_id
          AND session_date = d
          AND start_time = r.start_time;
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

SELECT 'Stream Line OS stage 6 migration complete' AS status;


-- ── supabase_migration_group_model_v2.sql ──

-- ============================================================
--  Stream Line — Group model v2
--  Structured schedule, level, target_audience, gender
-- ============================================================

-- ── 1. products columns ─────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS level INTEGER CHECK (level IS NULL OR level BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS level_label TEXT,
  ADD COLUMN IF NOT EXISTS target_audience TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'mixed'));

-- ── 2. target_audience_options ──────────────────────────────
CREATE TABLE IF NOT EXISTS target_audience_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL CHECK (kind IN ('age', 'grade')),
  label      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE target_audience_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read target_audience_options" ON target_audience_options;
CREATE POLICY "staff read target_audience_options"
  ON target_audience_options FOR SELECT
  USING (public.is_approved_staff());

DROP POLICY IF EXISTS "admin office manage target_audience_options" ON target_audience_options;
CREATE POLICY "admin office manage target_audience_options"
  ON target_audience_options FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

INSERT INTO target_audience_options (kind, label) VALUES
  ('age', 'גילאי 4-5'),
  ('age', 'גילאי 5.5-7'),
  ('age', 'גילאי 6-8'),
  ('grade', 'כיתות א''-ב'''),
  ('grade', 'כיתות ב''-ד'''),
  ('grade', 'כיתות ג''-ה'''),
  ('grade', 'כיתות ה''+')
ON CONFLICT (label) DO NOTHING;

-- ── 3. backfill existing products ───────────────────────────
UPDATE products p
SET
  gender = COALESCE(p.gender, 'mixed'),
  level = COALESCE(
    p.level,
    CASE
      WHEN p.level_label ~ 'רמה\s*(\d+)' THEN (regexp_match(p.level_label, 'רמה\s*(\d+)'))[1]::integer
      ELSE NULL
    END
  ),
  target_audience = COALESCE(
    p.target_audience,
    (
      SELECT g FROM (
        SELECT (regexp_matches(p.name || ' ' || COALESCE(p.level_label, ''), 'כיתות[^)\n]*', 'g'))[1] AS g
      ) x WHERE g IS NOT NULL
      LIMIT 1
    ),
    (
      SELECT a FROM (
        SELECT (regexp_matches(p.name || ' ' || COALESCE(p.level_label, ''), 'גילאי?\s*\d+(?:\.\d+)?\s*[\-–]\s*\d+', 'g'))[1] AS a
      ) x WHERE a IS NOT NULL
      LIMIT 1
    ),
    'גילאי 6-8'
  ),
  schedule_pattern = CASE
    WHEN COALESCE(jsonb_array_length(p.schedule_pattern->'schedule'), 0) > 0 THEN p.schedule_pattern
    WHEN pt.code = 'summer_course' THEN
      jsonb_build_object(
        'type', 'course_series',
        'schedule', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'day', wd::integer,
                'startTime', to_char(p.start_time, 'HH24:MI'),
                'endTime', to_char(p.end_time, 'HH24:MI')
              )
              ORDER BY wd::integer
            )
            FROM jsonb_array_elements_text(COALESCE(p.schedule_pattern->'weekdays', '[]'::jsonb)) AS wd
          ),
          '[]'::jsonb
        ),
        'weekdays', COALESCE(p.schedule_pattern->'weekdays', '[]'::jsonb),
        'course_start', p.schedule_pattern->>'course_start',
        'course_end', p.schedule_pattern->>'course_end'
      )
    WHEN p.day_of_week IS NOT NULL THEN
      jsonb_build_object(
        'type', 'weekly',
        'schedule', jsonb_build_array(
          jsonb_build_object(
            'day', p.day_of_week,
            'startTime', to_char(p.start_time, 'HH24:MI'),
            'endTime', to_char(p.end_time, 'HH24:MI')
          )
        )
      )
    ELSE p.schedule_pattern
  END,
  level_label = CASE
    WHEN p.level IS NOT NULL THEN 'רמה ' || p.level::text
    WHEN p.level_label ~ 'רמה\s*(\d+)' THEN p.level_label
    WHEN (regexp_match(p.level_label, 'רמה\s*(\d+)')) IS NOT NULL THEN 'רמה ' || (regexp_match(p.level_label, 'רמה\s*(\d+)'))[1]
    ELSE p.level_label
  END
FROM product_templates pt
WHERE pt.id = p.template_id;

-- ── 4. generate_course_series_sessions (schedule-aware) ─────
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
  v_schedule jsonb;
  v_d date;
  v_dow integer;
  v_session_id uuid;
  v_slot_start time;
  v_slot_end time;
  v_inserted_sessions integer := 0;
  v_inserted_attendees integer := 0;
  v_row_count integer;
  v_has_schedule boolean;
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

  v_schedule := COALESCE(v_pattern->'schedule', '[]'::jsonb);
  v_has_schedule := jsonb_array_length(v_schedule) > 0;

  SELECT COALESCE(array_agg((value::text)::integer ORDER BY ord), ARRAY[]::integer[])
  INTO v_weekdays
  FROM jsonb_array_elements_text(COALESCE(v_pattern->'weekdays', '[]'::jsonb))
    WITH ORDINALITY AS t(value, ord);

  IF NOT v_has_schedule AND array_length(v_weekdays, 1) IS NULL THEN
    RAISE EXCEPTION 'course_weekdays_missing';
  END IF;

  v_d := v_start;
  WHILE v_d <= v_end LOOP
    v_dow := EXTRACT(DOW FROM v_d)::integer;
    v_slot_start := NULL;
    v_slot_end := NULL;

    IF v_has_schedule THEN
      SELECT (s->>'startTime')::time, (s->>'endTime')::time
      INTO v_slot_start, v_slot_end
      FROM jsonb_array_elements(v_schedule) s
      WHERE (s->>'day')::integer = v_dow
      LIMIT 1;
    END IF;

    IF (v_has_schedule AND v_slot_start IS NOT NULL)
       OR (NOT v_has_schedule AND v_dow = ANY (v_weekdays)) THEN
      INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
      VALUES (
        v_product.id,
        v_d,
        COALESCE(v_slot_start, v_product.start_time),
        COALESCE(v_slot_end, v_product.end_time)
      )
      ON CONFLICT (product_id, session_date, start_time) DO NOTHING
      RETURNING id INTO v_session_id;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count > 0 THEN
        v_inserted_sessions := v_inserted_sessions + 1;
      END IF;

      IF v_session_id IS NULL THEN
        SELECT id INTO v_session_id
        FROM scheduled_sessions
        WHERE product_id = v_product.id
          AND session_date = v_d
          AND start_time = COALESCE(v_slot_start, v_product.start_time);
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

-- ── 5. generate_weekly_sessions (schedule-aware) ────────────
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
        COALESCE(
          (
            SELECT (s->>'startTime')::time
            FROM jsonb_array_elements(COALESCE(p.schedule_pattern->'schedule', '[]'::jsonb)) s
            WHERE (s->>'day')::integer = EXTRACT(DOW FROM d)::integer
            LIMIT 1
          ),
          p.start_time
        ) AS start_time,
        COALESCE(
          (
            SELECT (s->>'endTime')::time
            FROM jsonb_array_elements(COALESCE(p.schedule_pattern->'schedule', '[]'::jsonb)) s
            WHERE (s->>'day')::integer = EXTRACT(DOW FROM d)::integer
            LIMIT 1
          ),
          p.end_time
        ) AS end_time
      FROM enrollments e
      JOIN products p ON p.id = e.product_id
      JOIN product_templates pt ON pt.id = p.template_id
      WHERE e.active = TRUE
        AND d >= e.valid_from
        AND d <= e.valid_until
        AND pt.schedule_pattern->>'type' = 'weekly'
        AND (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p.schedule_pattern->'schedule', '[]'::jsonb)) s
            WHERE (s->>'day')::integer = EXTRACT(DOW FROM d)::integer
          )
          OR (
            COALESCE(jsonb_array_length(p.schedule_pattern->'schedule'), 0) = 0
            AND p.day_of_week IS NOT NULL
            AND p.day_of_week = EXTRACT(DOW FROM d)::integer
          )
        )
    LOOP
      sess_id := NULL;
      INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
      VALUES (r.product_id, d, r.start_time, r.end_time)
      ON CONFLICT (product_id, session_date, start_time) DO NOTHING
      RETURNING id INTO sess_id;

      IF sess_id IS NULL THEN
        SELECT id INTO sess_id
        FROM scheduled_sessions
        WHERE product_id = r.product_id
          AND session_date = d
          AND start_time = r.start_time;
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

SELECT 'Group model v2 migration complete' AS status;


-- ── supabase_migration_recurring_lessons.sql ──

-- ============================================================
--  MIGRATION: שיעורים קבועים (חוזרים)
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- ── טבלת שיעורים קבועים ──────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_name      TEXT NOT NULL,
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=ראשון
  start_time      TIME NOT NULL,
  instructor_name TEXT NOT NULL,
  instructor_id   UUID REFERENCES profiles(id),
  parent_phone    TEXT NOT NULL,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recurring_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approved read recurring lessons" ON recurring_lessons;
CREATE POLICY "approved read recurring lessons"
  ON recurring_lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS "instructor manage own recurring lessons" ON recurring_lessons;
CREATE POLICY "instructor manage own recurring lessons"
  ON recurring_lessons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'approved'
        AND (
          p.role = 'admin'
          OR (p.role = 'instructor' AND recurring_lessons.instructor_id = auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'approved'
        AND (
          p.role = 'admin'
          OR (p.role = 'instructor' AND instructor_id = auth.uid())
        )
    )
  );

-- ── עמודות נוספות ב-lessons ───────────────────────────────
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS recurring_lesson_id UUID REFERENCES recurring_lessons(id);
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS lessons_recurring_date_idx
  ON lessons (recurring_lesson_id, lesson_date)
  WHERE recurring_lesson_id IS NOT NULL;

-- ── יצירת שיעורי השבוע (יום ראשון 08:00 + גיבוי בפתיחת האפליקציה) ──
CREATE OR REPLACE FUNCTION public.generate_weekly_recurring_lessons()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  week_start date;
  target_date date;
  inserted_count integer := 0;
BEGIN
  week_start := CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::integer;

  FOR r IN SELECT * FROM recurring_lessons WHERE active = true LOOP
    target_date := week_start + r.day_of_week;

    IF target_date >= CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM lessons l
         WHERE l.recurring_lesson_id = r.id
           AND l.lesson_date = target_date
       ) THEN
      INSERT INTO lessons (
        child_name, lesson_date, start_time, end_time,
        instructor_name, instructor_id, parent_phone,
        recurring_lesson_id
      ) VALUES (
        r.child_name, target_date, r.start_time, r.start_time,
        r.instructor_name, r.instructor_id, r.parent_phone,
        r.id
      );
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_weekly_recurring_lessons() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_weekly_recurring_lessons() TO authenticated;

-- ── Cron: כל יום ראשון 06:00 UTC ≈ 08:00 ישראל (חורף) ───
-- הפעל pg_cron ב-Dashboard: Database → Extensions → pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule('generate-weekly-recurring-lessons')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-weekly-recurring-lessons'
);

SELECT cron.schedule(
  'generate-weekly-recurring-lessons',
  '0 6 * * 0',
  $$SELECT public.generate_weekly_recurring_lessons()$$
);

SELECT 'Recurring lessons migration complete ✓' AS status;


-- ── supabase_migration_lessons_instructor_id.sql ──

-- ============================================================
--  MIGRATION: instructor_id על טבלת lessons
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES profiles(id);

UPDATE lessons l
SET instructor_id = p.id
FROM profiles p
WHERE l.instructor_id IS NULL
  AND l.instructor_name IS NOT NULL
  AND p.full_name = l.instructor_name;

SELECT 'lessons.instructor_id migration complete ✓' AS status;


-- ── supabase_migration_lesson_manage.sql ──

-- ============================================================
--  MIGRATION: ביטול ועריכת שיעורים
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- שדות חדשים
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS parent_phone  TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS cancelled      BOOLEAN DEFAULT FALSE;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS cancelled_at   TIMESTAMPTZ;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS qr_token       UUID;

-- qr_token ייחודי — הברקוד מקודד את הטוקן (מתחדש בעריכה)
UPDATE lessons SET qr_token = id WHERE qr_token IS NULL;
ALTER TABLE lessons ALTER COLUMN qr_token SET DEFAULT gen_random_uuid();
ALTER TABLE lessons ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lessons_qr_token_idx ON lessons (qr_token);

-- מדריך/מנהל יכול לעדכן שיעור (ביטול, עריכה)
DROP POLICY IF EXISTS "instructor or admin update lesson details" ON lessons;
CREATE POLICY "instructor or admin update lesson details"
  ON lessons FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND status = 'approved'
        AND role IN ('instructor','admin')
    )
  );

SELECT 'Lesson manage migration complete ✓' AS status;


-- ── supabase_migration_season_planning.sql ──

-- Season planning: clone products, carry-forward enrollments, activate season, QR guards

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'annual'
    CHECK (kind IN ('annual', 'summer'));

DROP POLICY IF EXISTS "admin office insert seasons" ON seasons;
CREATE POLICY "admin office insert seasons"
  ON seasons FOR INSERT
  WITH CHECK (public.is_admin_or_office());

-- ── Product planning key (matches import script) ─────────────
CREATE OR REPLACE FUNCTION public.product_planning_key(
  p_day_of_week integer,
  p_instructor_name text,
  p_start_time time,
  p_end_time time,
  p_name text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT concat_ws('|',
    COALESCE(p_day_of_week::text, ''),
    COALESCE(trim(p_instructor_name), ''),
    to_char(p_start_time, 'HH24:MI:SS'),
    to_char(p_end_time, 'HH24:MI:SS'),
    COALESCE(trim(p_name), '')
  );
$$;

-- ── Suggest next annual season metadata ─────────────────────
CREATE OR REPLACE FUNCTION public.suggest_next_season()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest record;
  v_start date;
  v_end date;
  v_name text;
  v_y1 integer;
  v_y2 integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_latest
  FROM seasons
  WHERE kind = 'annual'
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_latest IS NULL THEN
    v_y1 := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
    IF EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN
      v_start := make_date(v_y1, 9, 1);
      v_end := make_date(v_y1 + 1, 6, 30);
      v_name := v_y1::text || '/' || right((v_y1 + 1)::text, 2);
    ELSE
      v_start := make_date(v_y1 - 1, 9, 1);
      v_end := make_date(v_y1, 6, 30);
      v_name := (v_y1 - 1)::text || '/' || right(v_y1::text, 2);
    END IF;
  ELSE
    v_start := (v_latest.start_date + interval '1 year')::date;
    v_end := (v_latest.end_date + interval '1 year')::date;
    v_y1 := EXTRACT(YEAR FROM v_start)::integer;
    v_y2 := EXTRACT(YEAR FROM v_end)::integer;
    v_name := v_y1::text || '/' || right(v_y2::text, 2);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'name', v_name,
    'start_date', v_start,
    'end_date', v_end,
    'kind', 'annual'
  );
END;
$$;

-- ── Create planning season ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_planning_season(
  p_name text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_kind text DEFAULT 'annual'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suggest json;
  v_name text;
  v_start date;
  v_end date;
  v_kind text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_suggest := public.suggest_next_season();
  IF (v_suggest->>'result') <> 'ok' THEN
    RETURN v_suggest;
  END IF;

  v_name := COALESCE(NULLIF(trim(p_name), ''), v_suggest->>'name');
  v_start := COALESCE(p_start_date, (v_suggest->>'start_date')::date);
  v_end := COALESCE(p_end_date, (v_suggest->>'end_date')::date);
  v_kind := COALESCE(NULLIF(trim(p_kind), ''), 'annual');

  IF EXISTS (SELECT 1 FROM seasons WHERE name = v_name) THEN
    RETURN json_build_object('result', 'duplicate_name', 'name', v_name);
  END IF;

  INSERT INTO seasons (name, start_date, end_date, active, kind)
  VALUES (v_name, v_start, v_end, false, v_kind)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'result', 'ok',
    'season_id', v_id,
    'name', v_name,
    'start_date', v_start,
    'end_date', v_end,
    'kind', v_kind
  );
END;
$$;

-- ── Clone annual products between seasons ────────────────────
CREATE OR REPLACE FUNCTION public.clone_season_products(
  p_source_season_id uuid,
  p_target_season_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped integer := 0;
  r record;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM seasons WHERE id = p_source_season_id) THEN
    RETURN json_build_object('result', 'source_not_found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM seasons WHERE id = p_target_season_id) THEN
    RETURN json_build_object('result', 'target_not_found');
  END IF;

  FOR r IN
    SELECT p.*
    FROM products p
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE p.season_id = p_source_season_id
      AND pt.code = 'annual_section'
    ORDER BY p.name, p.day_of_week, p.start_time
  LOOP
    IF EXISTS (
      SELECT 1
      FROM products tp
      JOIN product_templates tpt ON tpt.id = tp.template_id
      WHERE tp.season_id = p_target_season_id
        AND tpt.code = 'annual_section'
        AND public.product_planning_key(
          tp.day_of_week, tp.instructor_name, tp.start_time, tp.end_time, tp.name
        ) = public.product_planning_key(
          r.day_of_week, r.instructor_name, r.start_time, r.end_time, r.name
        )
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO products (
      season_id, template_id, name, day_of_week, start_time, end_time,
      instructor_name, instructor_id, capacity, level, level_label,
      target_audience, gender, schedule_pattern, price
    ) VALUES (
      p_target_season_id, r.template_id, r.name, r.day_of_week, r.start_time, r.end_time,
      r.instructor_name, r.instructor_id, r.capacity, r.level, r.level_label,
      r.target_audience, r.gender, r.schedule_pattern, r.price
    )
    RETURNING id INTO v_new_id;

    v_created := v_created + 1;
  END LOOP;

  RETURN json_build_object(
    'result', 'ok',
    'created', v_created,
    'skipped', v_skipped
  );
END;
$$;

-- ── Resolve source season for planning (active annual) ─────────
CREATE OR REPLACE FUNCTION public.resolve_planning_source_season(p_target_season_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.id
      FROM seasons s
      WHERE s.active = TRUE AND s.kind = 'annual'
      ORDER BY s.start_date DESC
      LIMIT 1
    ),
    (
      SELECT s.id
      FROM seasons s
      WHERE s.id <> p_target_season_id
        AND s.kind = 'annual'
        AND s.start_date < (SELECT start_date FROM seasons WHERE id = p_target_season_id)
      ORDER BY s.start_date DESC
      LIMIT 1
    )
  );
$$;

-- ── Carry forward enrollments ────────────────────────────────
CREATE OR REPLACE FUNCTION public.carry_forward_enrollments(
  p_source_season_id uuid,
  p_target_season_id uuid,
  p_dry_run boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped_duplicate integer := 0;
  v_unmatched integer := 0;
  v_dual_slot integer := 0;
  v_target_start date;
  v_target_end date;
  r record;
  v_target_product_id uuid;
  v_unmatched_rows jsonb := '[]'::jsonb;
  v_would_create jsonb := '[]'::jsonb;
  v_participant_planned integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT start_date, end_date INTO v_target_start, v_target_end
  FROM seasons WHERE id = p_target_season_id;

  IF v_target_start IS NULL THEN
    RETURN json_build_object('result', 'target_not_found');
  END IF;

  IF p_source_season_id IS NULL THEN
    p_source_season_id := public.resolve_planning_source_season(p_target_season_id);
  END IF;

  IF p_source_season_id IS NULL THEN
    RETURN json_build_object('result', 'source_not_found');
  END IF;

  FOR r IN
    SELECT
      e.id AS enrollment_id,
      e.participant_id,
      p.full_name AS participant_name,
      sp.id AS source_product_id,
      sp.day_of_week,
      sp.instructor_name,
      sp.start_time,
      sp.end_time,
      sp.name AS product_name,
      public.product_planning_key(
        sp.day_of_week, sp.instructor_name, sp.start_time, sp.end_time, sp.name
      ) AS pkey
    FROM enrollments e
    JOIN products sp ON sp.id = e.product_id
    JOIN product_templates spt ON spt.id = sp.template_id
    JOIN participants p ON p.id = e.participant_id
    WHERE sp.season_id = p_source_season_id
      AND e.active = TRUE
      AND spt.code = 'annual_section'
    ORDER BY p.full_name, sp.day_of_week, sp.start_time
  LOOP
    SELECT tp.id INTO v_target_product_id
    FROM products tp
    JOIN product_templates tpt ON tpt.id = tp.template_id
    WHERE tp.season_id = p_target_season_id
      AND tpt.code = 'annual_section'
      AND public.product_planning_key(
        tp.day_of_week, tp.instructor_name, tp.start_time, tp.end_time, tp.name
      ) = r.pkey
    LIMIT 1;

    IF v_target_product_id IS NULL THEN
      v_unmatched := v_unmatched + 1;
      v_unmatched_rows := v_unmatched_rows || jsonb_build_array(jsonb_build_object(
        'participant_id', r.participant_id,
        'participant_name', r.participant_name,
        'source_product_id', r.source_product_id,
        'source_product_name', r.product_name,
        'reason', 'no_matching_product'
      ));
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM enrollments
      WHERE participant_id = r.participant_id
        AND product_id = v_target_product_id
        AND active = TRUE
    ) THEN
      v_skipped_duplicate := v_skipped_duplicate + 1;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_created := v_created + 1;
      v_would_create := v_would_create || jsonb_build_array(jsonb_build_object(
        'participant_id', r.participant_id,
        'participant_name', r.participant_name,
        'target_product_id', v_target_product_id,
        'source_product_name', r.product_name
      ));
      CONTINUE;
    END IF;

    INSERT INTO enrollments (
      product_id, participant_id, payment_status, valid_from, valid_until, active
    ) VALUES (
      v_target_product_id, r.participant_id, 'unpaid', v_target_start, v_target_end, TRUE
    );

    v_created := v_created + 1;
  END LOOP;

  SELECT COUNT(*)::integer INTO v_dual_slot
  FROM (
    SELECT e.participant_id
    FROM enrollments e
    JOIN products pr ON pr.id = e.product_id
    WHERE pr.season_id = p_target_season_id
      AND e.active = TRUE
    GROUP BY e.participant_id
    HAVING COUNT(*) > 1
  ) duals;

  SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_participant_planned
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  WHERE pr.season_id = p_target_season_id AND e.active = TRUE;

  RETURN json_build_object(
    'result', 'ok',
    'dry_run', p_dry_run,
    'source_season_id', p_source_season_id,
    'target_season_id', p_target_season_id,
    'created', v_created,
    'skipped_duplicate', v_skipped_duplicate,
    'unmatched', v_unmatched,
    'unmatched_rows', v_unmatched_rows,
    'would_create', CASE WHEN p_dry_run THEN v_would_create ELSE NULL END,
    'dual_slot_participants', COALESCE(v_dual_slot, 0),
    'planned_participants', COALESCE(v_participant_planned, 0)
  );
END;
$$;

-- ── Planning summary KPIs + participant rows ─────────────────
CREATE OR REPLACE FUNCTION public.get_season_planning_summary(
  p_target_season_id uuid,
  p_source_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id uuid;
  v_target record;
  v_source record;
  v_active_current integer := 0;
  v_planned integer := 0;
  v_missing integer := 0;
  v_renewal_pct numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  r record;
  v_target_product_id uuid;
  v_planned_product_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_target FROM seasons WHERE id = p_target_season_id;
  IF v_target IS NULL THEN
    RETURN json_build_object('result', 'target_not_found');
  END IF;

  v_source_id := COALESCE(p_source_season_id, public.resolve_planning_source_season(p_target_season_id));
  IF v_source_id IS NOT NULL THEN
    SELECT * INTO v_source FROM seasons WHERE id = v_source_id;
  END IF;

  SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_planned
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE pr.season_id = p_target_season_id
    AND e.active = TRUE
    AND pt.code = 'annual_section';

  IF v_source_id IS NULL OR v_source.id IS NULL THEN
    RETURN json_build_object(
      'result', 'ok',
      'target_season', json_build_object(
        'id', v_target.id,
        'name', v_target.name,
        'start_date', v_target.start_date,
        'end_date', v_target.end_date,
        'active', v_target.active,
        'kind', v_target.kind
      ),
      'source_season', NULL,
      'active_current', 0,
      'planned', v_planned,
      'missing', 0,
      'renewal_pct', 0,
      'rows', '[]'::jsonb
    );
  END IF;

  SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_active_current
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE pr.season_id = v_source.id
    AND e.active = TRUE
    AND pt.code = 'annual_section';

  FOR r IN
    SELECT DISTINCT ON (p.id)
      p.id AS participant_id,
      p.full_name AS participant_name,
      sp.name AS current_product_name,
      sp.instructor_name AS current_instructor,
      sp.day_of_week AS current_day,
      sp.start_time AS current_start
    FROM participants p
    JOIN enrollments e ON e.participant_id = p.id AND e.active = TRUE
    JOIN products sp ON sp.id = e.product_id
    JOIN product_templates spt ON spt.id = sp.template_id
    WHERE sp.season_id = v_source.id
      AND spt.code = 'annual_section'
    ORDER BY p.id, sp.day_of_week, sp.start_time
  LOOP
    SELECT e.product_id INTO v_planned_product_id
    FROM enrollments e
    JOIN products tp ON tp.id = e.product_id
    JOIN product_templates tpt ON tpt.id = tp.template_id
    WHERE e.participant_id = r.participant_id
      AND e.active = TRUE
      AND tp.season_id = p_target_season_id
      AND tpt.code = 'annual_section'
    LIMIT 1;

    IF v_planned_product_id IS NOT NULL THEN
      v_status := 'planned';
    ELSE
      v_status := 'missing';
      v_missing := v_missing + 1;
    END IF;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'participant_id', r.participant_id,
      'participant_name', r.participant_name,
      'status', v_status,
      'current_product_name', r.current_product_name,
      'current_instructor', r.current_instructor,
      'current_day', r.current_day,
      'current_start', r.current_start,
      'planned_product_id', v_planned_product_id,
      'planned_product_name', (
        SELECT name FROM products WHERE id = v_planned_product_id
      )
    ));
  END LOOP;

  IF v_active_current > 0 THEN
    v_renewal_pct := ROUND(100.0 * (v_active_current - v_missing) / v_active_current, 1);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'target_season', json_build_object(
      'id', v_target.id,
      'name', v_target.name,
      'start_date', v_target.start_date,
      'end_date', v_target.end_date,
      'active', v_target.active,
      'kind', v_target.kind
    ),
    'source_season', CASE WHEN v_source.id IS NULL THEN NULL ELSE json_build_object(
      'id', v_source.id,
      'name', v_source.name,
      'start_date', v_source.start_date,
      'end_date', v_source.end_date,
      'active', v_source.active
    ) END,
    'active_current', v_active_current,
    'planned', v_planned,
    'missing', v_missing,
    'renewal_pct', v_renewal_pct,
    'rows', v_rows
  );
END;
$$;

-- ── Activate season (go-live) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_season(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season record;
  v_sessions integer;
  v_to date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_season FROM seasons WHERE id = p_season_id;
  IF v_season IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_season.active THEN
    RETURN json_build_object('result', 'already_active', 'season_id', p_season_id);
  END IF;

  UPDATE seasons SET active = FALSE WHERE active = TRUE AND id <> p_season_id;
  UPDATE seasons SET active = TRUE WHERE id = p_season_id;

  v_to := v_season.start_date + 14;
  v_sessions := public.generate_weekly_sessions(v_season.start_date, v_to);

  INSERT INTO sheet_sync_runs (direction, sheet_tab, status, rows_in, finished_at)
  VALUES ('push', 'season_activate:' || v_season.name, 'ok', v_sessions, NOW());

  RETURN json_build_object(
    'result', 'ok',
    'season_id', p_season_id,
    'name', v_season.name,
    'sessions_generated', v_sessions
  );
END;
$$;

-- ── Guard: access passes only for active seasons ─────────────
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
    JOIN seasons s ON s.id = p.season_id AND s.active = TRUE
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
    e.active AS enrollment_active,
    s.active AS season_active
  INTO r
  FROM access_passes ap
  JOIN participants p ON p.id = ap.participant_id
  JOIN scheduled_sessions ss ON ss.id = ap.session_id
  JOIN products pr ON pr.id = ss.product_id
  JOIN seasons s ON s.id = pr.season_id
  JOIN enrollments e ON e.id = ap.enrollment_id
  WHERE ap.qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF NOT r.season_active THEN
    RETURN json_build_object('result', 'season_inactive', 'child_name', r.child_name);
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

REVOKE ALL ON FUNCTION public.product_planning_key(integer, text, time, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_planning_key(integer, text, time, time, text) TO authenticated;

REVOKE ALL ON FUNCTION public.suggest_next_season() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_next_season() TO authenticated;

REVOKE ALL ON FUNCTION public.create_planning_season(text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_planning_season(text, date, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.clone_season_products(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_season_products(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_planning_source_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_planning_source_season(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.carry_forward_enrollments(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_forward_enrollments(uuid, uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_season_planning_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_planning_summary(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.activate_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_season(uuid) TO authenticated;

SELECT 'Season planning migration complete' AS status;


-- ── supabase_migration_season_planning_v2.sql ──

-- Season planning v2: annual/summer phases, master schedule, continuation intents

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS summer_planning_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Master weekly schedule slots ─────────────────────────────
CREATE TABLE IF NOT EXISTS season_schedule_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id    UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  layer        TEXT NOT NULL CHECK (layer IN ('annual', 'summer')),
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  label        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS season_schedule_slots_unique_idx
  ON season_schedule_slots (season_id, layer, day_of_week, start_time);

CREATE INDEX IF NOT EXISTS season_schedule_slots_season_idx
  ON season_schedule_slots (season_id);

-- ── Annual continuation intents ──────────────────────────────
CREATE TABLE IF NOT EXISTS participant_season_intents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id          UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  participant_id     UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  intent             TEXT NOT NULL DEFAULT 'undecided'
    CHECK (intent IN ('confirmed', 'refused', 'undecided')),
  source_product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  target_product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  enrollment_id      UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS participant_season_intents_unique_idx
  ON participant_season_intents (season_id, participant_id);

ALTER TABLE season_schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_season_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read season_schedule_slots" ON season_schedule_slots;
CREATE POLICY "staff read season_schedule_slots"
  ON season_schedule_slots FOR SELECT
  USING (public.is_approved_staff());

DROP POLICY IF EXISTS "admin office manage season_schedule_slots" ON season_schedule_slots;
CREATE POLICY "admin office manage season_schedule_slots"
  ON season_schedule_slots FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

DROP POLICY IF EXISTS "staff read participant_season_intents" ON participant_season_intents;
CREATE POLICY "staff read participant_season_intents"
  ON participant_season_intents FOR SELECT
  USING (public.is_approved_staff());

DROP POLICY IF EXISTS "admin office manage participant_season_intents" ON participant_season_intents;
CREATE POLICY "admin office manage participant_season_intents"
  ON participant_season_intents FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ── Sync product from slot assignment ────────────────────────
CREATE OR REPLACE FUNCTION public.sync_product_from_schedule_slot(p_slot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_code text;
BEGIN
  SELECT s.*, pt.code AS template_code
  INTO v_slot
  FROM season_schedule_slots s
  LEFT JOIN products p ON p.id = s.product_id
  LEFT JOIN product_templates pt ON pt.id = p.template_id
  WHERE s.id = p_slot_id;

  IF v_slot.product_id IS NULL THEN RETURN; END IF;

  v_code := v_slot.template_code;
  IF v_code = 'annual_section' OR v_code IS NULL THEN
    UPDATE products SET
      day_of_week = v_slot.day_of_week,
      start_time = v_slot.start_time,
      end_time = v_slot.end_time,
      schedule_pattern = jsonb_build_object(
        'type', 'weekly',
        'schedule', jsonb_build_array(jsonb_build_object(
          'day', v_slot.day_of_week,
          'startTime', to_char(v_slot.start_time, 'HH24:MI'),
          'endTime', to_char(v_slot.end_time, 'HH24:MI')
        ))
      )
    WHERE id = v_slot.product_id;
  ELSIF v_code = 'summer_course' THEN
    UPDATE products SET
      start_time = v_slot.start_time,
      end_time = v_slot.end_time,
      schedule_pattern = COALESCE(schedule_pattern, '{}'::jsonb) || jsonb_build_object(
        'type', 'course_series',
        'weekdays', COALESCE(schedule_pattern->'weekdays', jsonb_build_array(v_slot.day_of_week))
      )
    WHERE id = v_slot.product_id;
  END IF;
END;
$$;

-- ── Selective clone (annual only) ────────────────────────────
CREATE OR REPLACE FUNCTION public.clone_season_products(
  p_source_season_id uuid,
  p_target_season_id uuid,
  p_product_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped integer := 0;
  r record;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN json_build_object('result', 'no_products_selected');
  END IF;

  FOR r IN
    SELECT p.*
    FROM products p
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE p.season_id = p_source_season_id
      AND p.id = ANY(p_product_ids)
      AND pt.code = 'annual_section'
    ORDER BY p.name, p.day_of_week, p.start_time
  LOOP
    IF EXISTS (
      SELECT 1 FROM products tp
      JOIN product_templates tpt ON tpt.id = tp.template_id
      WHERE tp.season_id = p_target_season_id
        AND tpt.code = 'annual_section'
        AND public.product_planning_key(
          tp.day_of_week, tp.instructor_name, tp.start_time, tp.end_time, tp.name
        ) = public.product_planning_key(
          r.day_of_week, r.instructor_name, r.start_time, r.end_time, r.name
        )
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO products (
      season_id, template_id, name, day_of_week, start_time, end_time,
      instructor_name, instructor_id, capacity, level, level_label,
      target_audience, gender, schedule_pattern, price
    ) VALUES (
      p_target_season_id, r.template_id, r.name, r.day_of_week, r.start_time, r.end_time,
      r.instructor_name, r.instructor_id, r.capacity, r.level, r.level_label,
      r.target_audience, r.gender, r.schedule_pattern, r.price
    )
    RETURNING id INTO v_new_id;

    INSERT INTO season_schedule_slots (
      season_id, layer, day_of_week, start_time, end_time, product_id, label
    ) VALUES (
      p_target_season_id, 'annual', r.day_of_week, r.start_time, r.end_time,
      v_new_id, r.name
    )
    ON CONFLICT (season_id, layer, day_of_week, start_time) DO UPDATE
      SET product_id = EXCLUDED.product_id, end_time = EXCLUDED.end_time, label = EXCLUDED.label;

    v_created := v_created + 1;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'created', v_created, 'skipped', v_skipped);
END;
$$;

-- ── List cloneable annual products from source season ─────────
CREATE OR REPLACE FUNCTION public.list_source_annual_products(p_source_season_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'day_of_week', p.day_of_week,
        'start_time', p.start_time,
        'end_time', p.end_time,
        'instructor_name', p.instructor_name
      ) ORDER BY p.day_of_week, p.start_time, p.name)
      FROM products p
      JOIN product_templates pt ON pt.id = p.template_id
      WHERE p.season_id = p_source_season_id AND pt.code = 'annual_section'
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Apply intent side-effects (enrollment sync) ──────────────
CREATE OR REPLACE FUNCTION public.apply_participant_intent_enrollment(p_intent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_season record;
  v_enr_id uuid;
BEGIN
  SELECT psi.*, s.start_date, s.end_date, s.active AS season_active
  INTO v_row
  FROM participant_season_intents psi
  JOIN seasons s ON s.id = psi.season_id
  WHERE psi.id = p_intent_id;

  IF v_row.intent = 'confirmed' AND v_row.target_product_id IS NOT NULL THEN
    SELECT id INTO v_enr_id
    FROM enrollments
    WHERE participant_id = v_row.participant_id
      AND product_id = v_row.target_product_id
      AND active = TRUE
    LIMIT 1;

    IF v_enr_id IS NULL THEN
      INSERT INTO enrollments (
        product_id, participant_id, payment_status, valid_from, valid_until, active
      ) VALUES (
        v_row.target_product_id, v_row.participant_id, 'unpaid',
        v_row.start_date, v_row.end_date, TRUE
      )
      RETURNING id INTO v_enr_id;
    END IF;

    UPDATE participant_season_intents
    SET enrollment_id = v_enr_id, updated_at = NOW()
    WHERE id = p_intent_id;

  ELSIF v_row.intent IN ('refused', 'undecided') AND v_row.enrollment_id IS NOT NULL THEN
    PERFORM public.cancel_enrollment(v_row.enrollment_id);
    UPDATE participant_season_intents
    SET enrollment_id = NULL, updated_at = NOW()
    WHERE id = p_intent_id;
  END IF;
END;
$$;

-- ── Set participant continuation intent ──────────────────────
CREATE OR REPLACE FUNCTION public.set_participant_intent(
  p_season_id uuid,
  p_participant_id uuid,
  p_intent text,
  p_target_product_id uuid DEFAULT NULL,
  p_source_product_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_intent text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_intent := COALESCE(p_intent, 'undecided');
  IF v_intent NOT IN ('confirmed', 'refused', 'undecided') THEN
    RETURN json_build_object('result', 'invalid_intent');
  END IF;

  INSERT INTO participant_season_intents (
    season_id, participant_id, intent, source_product_id, target_product_id
  ) VALUES (
    p_season_id, p_participant_id, v_intent, p_source_product_id, p_target_product_id
  )
  ON CONFLICT (season_id, participant_id) DO UPDATE SET
    intent = EXCLUDED.intent,
    source_product_id = COALESCE(EXCLUDED.source_product_id, participant_season_intents.source_product_id),
    target_product_id = COALESCE(EXCLUDED.target_product_id, participant_season_intents.target_product_id),
    updated_at = NOW()
  RETURNING id INTO v_id;

  PERFORM public.apply_participant_intent_enrollment(v_id);

  RETURN json_build_object('result', 'ok', 'intent_id', v_id);
END;
$$;

-- ── Carry forward as undecided intents (not enrollments) ─────
CREATE OR REPLACE FUNCTION public.carry_forward_intents(
  p_source_season_id uuid,
  p_target_season_id uuid,
  p_dry_run boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped integer := 0;
  v_unmatched integer := 0;
  r record;
  v_target_product_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_source_season_id IS NULL THEN
    p_source_season_id := public.resolve_planning_source_season(p_target_season_id);
  END IF;

  IF p_source_season_id IS NULL THEN
    RETURN json_build_object('result', 'source_not_found');
  END IF;

  FOR r IN
    SELECT
      e.participant_id,
      sp.id AS source_product_id,
      public.product_planning_key(
        sp.day_of_week, sp.instructor_name, sp.start_time, sp.end_time, sp.name
      ) AS pkey
    FROM enrollments e
    JOIN products sp ON sp.id = e.product_id
    JOIN product_templates spt ON spt.id = sp.template_id
    WHERE sp.season_id = p_source_season_id
      AND e.active = TRUE
      AND spt.code = 'annual_section'
  LOOP
    SELECT tp.id INTO v_target_product_id
    FROM products tp
    JOIN product_templates tpt ON tpt.id = tp.template_id
    WHERE tp.season_id = p_target_season_id
      AND tpt.code = 'annual_section'
      AND public.product_planning_key(
        tp.day_of_week, tp.instructor_name, tp.start_time, tp.end_time, tp.name
      ) = r.pkey
    LIMIT 1;

    IF v_target_product_id IS NULL THEN
      v_unmatched := v_unmatched + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM participant_season_intents
      WHERE season_id = p_target_season_id AND participant_id = r.participant_id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_created := v_created + 1;
      CONTINUE;
    END IF;

    INSERT INTO participant_season_intents (
      season_id, participant_id, intent, source_product_id, target_product_id
    ) VALUES (
      p_target_season_id, r.participant_id, 'undecided', r.source_product_id, v_target_product_id
    );
    v_created := v_created + 1;
  END LOOP;

  RETURN json_build_object(
    'result', 'ok',
    'dry_run', p_dry_run,
    'created', v_created,
    'skipped', v_skipped,
    'unmatched', v_unmatched
  );
END;
$$;

-- ── Annual planning summary ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_annual_planning_summary(
  p_target_season_id uuid,
  p_source_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id uuid;
  v_target record;
  v_source record;
  v_active_current integer := 0;
  v_confirmed integer := 0;
  v_refused integer := 0;
  v_undecided integer := 0;
  v_no_intent integer := 0;
  v_renewal_pct numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  r record;
  v_intent record;
  v_status text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_target FROM seasons WHERE id = p_target_season_id;
  IF v_target IS NULL THEN
    RETURN json_build_object('result', 'target_not_found');
  END IF;

  v_source_id := COALESCE(p_source_season_id, public.resolve_planning_source_season(p_target_season_id));
  IF v_source_id IS NOT NULL THEN
    SELECT * INTO v_source FROM seasons WHERE id = v_source_id;
  END IF;

  IF v_source.id IS NOT NULL THEN
    SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_active_current
    FROM enrollments e
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    WHERE pr.season_id = v_source.id AND e.active = TRUE AND pt.code = 'annual_section';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE intent = 'confirmed')::integer,
    COUNT(*) FILTER (WHERE intent = 'refused')::integer,
    COUNT(*) FILTER (WHERE intent = 'undecided')::integer
  INTO v_confirmed, v_refused, v_undecided
  FROM participant_season_intents
  WHERE season_id = p_target_season_id;

  IF v_source.id IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT ON (p.id)
        p.id AS participant_id,
        p.full_name AS participant_name,
        sp.id AS source_product_id,
        sp.name AS current_product_name,
        sp.instructor_name AS current_instructor,
        sp.day_of_week AS current_day,
        sp.start_time AS current_start
      FROM participants p
      JOIN enrollments e ON e.participant_id = p.id AND e.active = TRUE
      JOIN products sp ON sp.id = e.product_id
      JOIN product_templates spt ON spt.id = sp.template_id
      WHERE sp.season_id = v_source.id AND spt.code = 'annual_section'
      ORDER BY p.id, sp.day_of_week, sp.start_time
    LOOP
      SELECT * INTO v_intent
      FROM participant_season_intents
      WHERE season_id = p_target_season_id AND participant_id = r.participant_id;

      IF v_intent.id IS NULL THEN
        v_status := 'no_intent';
        v_no_intent := v_no_intent + 1;
      ELSE
        v_status := v_intent.intent;
      END IF;

      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'participant_id', r.participant_id,
        'participant_name', r.participant_name,
        'status', v_status,
        'intent', COALESCE(v_intent.intent, 'no_intent'),
        'current_product_name', r.current_product_name,
        'current_instructor', r.current_instructor,
        'current_day', r.current_day,
        'current_start', r.current_start,
        'source_product_id', r.source_product_id,
        'target_product_id', v_intent.target_product_id,
        'planned_product_name', (SELECT name FROM products WHERE id = v_intent.target_product_id),
        'enrollment_id', v_intent.enrollment_id
      ));
    END LOOP;
  END IF;

  IF v_active_current > 0 THEN
    v_renewal_pct := ROUND(100.0 * v_confirmed / v_active_current, 1);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'target_season', json_build_object(
      'id', v_target.id, 'name', v_target.name,
      'start_date', v_target.start_date, 'end_date', v_target.end_date,
      'active', v_target.active, 'kind', v_target.kind,
      'summer_planning_enabled', v_target.summer_planning_enabled
    ),
    'source_season', CASE WHEN v_source.id IS NULL THEN NULL ELSE json_build_object(
      'id', v_source.id, 'name', v_source.name
    ) END,
    'active_current', v_active_current,
    'confirmed', v_confirmed,
    'refused', v_refused,
    'undecided', v_undecided,
    'no_intent', v_no_intent,
    'renewal_pct', v_renewal_pct,
    'rows', v_rows
  );
END;
$$;

-- ── Summer planning summary ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_summer_planning_summary(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season record;
  v_courses integer := 0;
  v_enrolled integer := 0;
  v_slots integer := 0;
  v_empty_slots integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_season FROM seasons WHERE id = p_season_id;
  IF v_season IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  SELECT COUNT(*)::integer INTO v_courses
  FROM products p
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.season_id = p_season_id AND pt.code = 'summer_course';

  SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_enrolled
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.season_id = p_season_id AND e.active = TRUE AND pt.code = 'summer_course';

  SELECT COUNT(*)::integer, COUNT(*) FILTER (WHERE product_id IS NULL)::integer
  INTO v_slots, v_empty_slots
  FROM season_schedule_slots
  WHERE season_id = p_season_id AND layer = 'summer';

  RETURN json_build_object(
    'result', 'ok',
    'season', json_build_object(
      'id', v_season.id, 'name', v_season.name,
      'summer_planning_enabled', v_season.summer_planning_enabled
    ),
    'courses', v_courses,
    'enrolled', v_enrolled,
    'summer_slots', v_slots,
    'empty_summer_slots', v_empty_slots
  );
END;
$$;

-- ── Master schedule fetch ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_season_master_schedule(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_approved_staff() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'layer', s.layer,
        'day_of_week', s.day_of_week,
        'start_time', s.start_time,
        'end_time', s.end_time,
        'product_id', s.product_id,
        'label', s.label,
        'product_name', p.name,
        'instructor_name', p.instructor_name,
        'template_code', pt.code
      ) ORDER BY s.layer, s.day_of_week, s.start_time)
      FROM season_schedule_slots s
      LEFT JOIN products p ON p.id = s.product_id
      LEFT JOIN product_templates pt ON pt.id = p.template_id
      WHERE s.season_id = p_season_id
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Upsert schedule slot ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_schedule_slot(
  p_season_id uuid,
  p_layer text,
  p_day_of_week integer,
  p_start_time time,
  p_end_time time,
  p_label text DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_layer NOT IN ('annual', 'summer') THEN
    RETURN json_build_object('result', 'invalid_layer');
  END IF;

  IF p_slot_id IS NOT NULL THEN
    UPDATE season_schedule_slots SET
      day_of_week = p_day_of_week,
      start_time = p_start_time,
      end_time = p_end_time,
      label = p_label
    WHERE id = p_slot_id AND season_id = p_season_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO season_schedule_slots (
      season_id, layer, day_of_week, start_time, end_time, label
    ) VALUES (
      p_season_id, p_layer, p_day_of_week, p_start_time, p_end_time, p_label
    )
    ON CONFLICT (season_id, layer, day_of_week, start_time) DO UPDATE
      SET end_time = EXCLUDED.end_time, label = EXCLUDED.label
    RETURNING id INTO v_id;
  END IF;

  RETURN json_build_object('result', 'ok', 'slot_id', v_id);
END;
$$;

-- ── Assign product to slot ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_slot_product(
  p_slot_id uuid,
  p_product_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
  v_code text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT s.*, pt.code AS template_code
  INTO v_slot
  FROM season_schedule_slots s
  LEFT JOIN products p ON p.id = p_product_id
  LEFT JOIN product_templates pt ON pt.id = p.template_id
  WHERE s.id = p_slot_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'slot_not_found');
  END IF;

  IF p_product_id IS NOT NULL THEN
    v_code := v_slot.template_code;
    IF v_slot.layer = 'annual' AND v_code <> 'annual_section' THEN
      RETURN json_build_object('result', 'invalid_product_layer');
    END IF;
    IF v_slot.layer = 'summer' AND v_code <> 'summer_course' THEN
      RETURN json_build_object('result', 'invalid_product_layer');
    END IF;
  END IF;

  UPDATE season_schedule_slots
  SET product_id = p_product_id
  WHERE id = p_slot_id;

  PERFORM public.sync_product_from_schedule_slot(p_slot_id);

  RETURN json_build_object('result', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_schedule_slot(p_slot_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;
  DELETE FROM season_schedule_slots WHERE id = p_slot_id;
  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── Enable summer planning phase ─────────────────────────────
CREATE OR REPLACE FUNCTION public.enable_summer_planning(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  UPDATE seasons SET summer_planning_enabled = TRUE WHERE id = p_season_id;

  RETURN json_build_object('result', 'ok', 'season_id', p_season_id);
END;
$$;

-- ── Backfill: slots from annual products ─────────────────────
INSERT INTO season_schedule_slots (season_id, layer, day_of_week, start_time, end_time, product_id, label)
SELECT
  p.season_id, 'annual', p.day_of_week, p.start_time, p.end_time, p.id, p.name
FROM products p
JOIN product_templates pt ON pt.id = p.template_id
WHERE pt.code = 'annual_section'
  AND p.day_of_week IS NOT NULL
ON CONFLICT (season_id, layer, day_of_week, start_time) DO NOTHING;

-- ── Backfill: intents from existing planning enrollments ─────
INSERT INTO participant_season_intents (
  season_id, participant_id, intent, target_product_id, enrollment_id
)
SELECT DISTINCT ON (p.season_id, e.participant_id)
  p.season_id, e.participant_id, 'confirmed', e.product_id, e.id
FROM enrollments e
JOIN products p ON p.id = e.product_id
JOIN product_templates pt ON pt.id = p.template_id
JOIN seasons s ON s.id = p.season_id
WHERE e.active = TRUE
  AND pt.code = 'annual_section'
  AND s.active = FALSE
  AND s.start_date > CURRENT_DATE
ON CONFLICT (season_id, participant_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.sync_product_from_schedule_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_product_from_schedule_slot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_source_annual_products(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_source_annual_products(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_participant_intent_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_participant_intent_enrollment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_participant_intent(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_participant_intent(uuid, uuid, text, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.carry_forward_intents(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_forward_intents(uuid, uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_annual_planning_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_annual_planning_summary(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_summer_planning_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_summer_planning_summary(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_season_master_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_master_schedule(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_schedule_slot(uuid, text, integer, time, time, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_schedule_slot(uuid, text, integer, time, time, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_slot_product(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_slot_product(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_schedule_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_schedule_slot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.enable_summer_planning(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enable_summer_planning(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.clone_season_products(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_season_products(uuid, uuid, uuid[]) TO authenticated;

SELECT 'Season planning v2 migration complete' AS status;


-- ── supabase_migration_merge_swimming_seasons.sql ──

-- Merge summer micro-season into the annual swimming year (2025/26).
-- Idempotent: safe if already merged.

DO $$
DECLARE
  v_annual uuid;
  v_summer uuid;
BEGIN
  SELECT id INTO v_annual
  FROM seasons
  WHERE name IN ('2025/26', '2025-2026')
  ORDER BY start_date
  LIMIT 1;

  SELECT id INTO v_summer
  FROM seasons
  WHERE name = 'קיץ 2026'
  LIMIT 1;

  IF v_summer IS NOT NULL AND v_annual IS NOT NULL AND v_summer <> v_annual THEN
    UPDATE products SET season_id = v_annual WHERE season_id = v_summer;
    UPDATE billing_records SET season_id = v_annual WHERE season_id = v_summer;
    UPDATE participant_annual_packages SET season_id = v_annual WHERE season_id = v_summer;
    DELETE FROM seasons WHERE id = v_summer;
  ELSIF v_summer IS NOT NULL AND v_annual IS NULL THEN
    UPDATE seasons SET
      name = '2025/26',
      start_date = '2025-09-01',
      end_date = '2026-09-01',
      active = true
    WHERE id = v_summer;
    v_annual := v_summer;
  END IF;

  IF v_annual IS NOT NULL THEN
    UPDATE seasons SET
      name = '2025/26',
      start_date = '2025-09-01',
      end_date = '2026-09-01',
      active = true
    WHERE id = v_annual;

    UPDATE seasons SET active = false
    WHERE id <> v_annual AND active = true;
  END IF;
END $$;

DROP POLICY IF EXISTS "admin office manage seasons" ON seasons;

CREATE POLICY "admin office update seasons"
  ON seasons FOR UPDATE
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());


-- ── supabase_migration_child_portal.sql ──

-- ============================================================
--  Child entry portal — permanent link + PIN per participant
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Config (PIN encryption secret) ──────────────────────────
CREATE TABLE IF NOT EXISTS portal_config (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pin_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')
);

INSERT INTO portal_config (id, pin_secret)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.portal_pin_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pin_secret FROM portal_config WHERE id = 1;
$$;

-- ── Schema: participants ────────────────────────────────────
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS portal_token UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_pin_enc TEXT,
  ADD COLUMN IF NOT EXISTS portal_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portal_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_photo_data BYTEA,
  ADD COLUMN IF NOT EXISTS portal_photo_mime TEXT,
  ADD COLUMN IF NOT EXISTS photo_uploaded_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS participants_portal_token_idx
  ON participants (portal_token)
  WHERE portal_token IS NOT NULL;

-- ── Schema: lessons ─────────────────────────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lessons_participant_id_idx ON lessons (participant_id);

-- ── Portal sessions (anon dashboard auth) ───────────────────
CREATE TABLE IF NOT EXISTS portal_sessions (
  nonce           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portal_sessions_participant_idx
  ON portal_sessions (participant_id, expires_at DESC);

-- ── Audit log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID REFERENCES participants(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_config ENABLE ROW LEVEL SECURITY;

-- ── Staff helpers ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff_portal_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role IN ('admin', 'office', 'instructor')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_portal_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role IN ('admin', 'office')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_photo_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff_portal_viewer();
$$;

-- ── PIN helpers ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_portal_pin()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_pin text;
BEGIN
  LOOP
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    EXIT WHEN v_pin <> '000000';
  END LOOP;
  RETURN v_pin;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_encrypt_pin(p_pin text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.pgp_sym_encrypt(p_pin, public.portal_pin_secret()), 'base64');
$$;

CREATE OR REPLACE FUNCTION public.portal_decrypt_pin(p_enc text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_decrypt(decode(p_enc, 'base64'), public.portal_pin_secret());
$$;

CREATE OR REPLACE FUNCTION public.portal_photo_data_url(p_data bytea, p_mime text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_data IS NULL THEN NULL
    ELSE 'data:' || COALESCE(NULLIF(p_mime, ''), 'image/jpeg') || ';base64,' || encode(p_data, 'base64')
  END;
$$;

CREATE OR REPLACE FUNCTION public.portal_season_expires_at()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (end_date::timestamptz + INTERVAL '1 day' - INTERVAL '1 second')
      FROM seasons
      WHERE active = TRUE
      ORDER BY end_date DESC
      LIMIT 1
    ),
    (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 second')
  );
$$;

-- ── Validate portal session ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_validate_session(p_token uuid, p_nonce uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
BEGIN
  SELECT p.id INTO v_participant_id
  FROM participants p
  WHERE p.portal_token = p_token;

  IF v_participant_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM portal_sessions ps
    WHERE ps.nonce = p_nonce
      AND ps.participant_id = v_participant_id
      AND ps.expires_at > NOW()
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v_participant_id;
END;
$$;

-- ── ensure_participant_portal ───────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_participant_portal(p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row participants%ROWTYPE;
  v_pin text;
BEGIN
  SELECT * INTO v_row FROM participants WHERE id = p_participant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_row.portal_token IS NULL THEN
    v_pin := public.generate_portal_pin();
    UPDATE participants
    SET
      portal_token = gen_random_uuid(),
      portal_pin_enc = public.portal_encrypt_pin(v_pin),
      portal_failed_attempts = 0,
      portal_locked_at = NULL
    WHERE id = p_participant_id
    RETURNING * INTO v_row;
  ELSE
    v_pin := public.portal_decrypt_pin(v_row.portal_pin_enc);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'participant_id', v_row.id,
    'portal_token', v_row.portal_token,
    'portal_pin', v_pin
  );
END;
$$;

-- ── Upcoming entry (pass or private lesson) ─────────────────
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
BEGIN
  SELECT p.full_name INTO v_child_name FROM participants p WHERE p.id = p_participant_id;

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

-- ── Recent entries ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_portal_recent_entries(p_participant_id uuid, p_limit int DEFAULT 12)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pass_entries AS (
    SELECT
      al.scanned_at AS used_at,
      (al.reason::json)->>'session_date' AS session_date,
      (al.reason::json)->>'start_time' AS start_time,
      (al.reason::json)->>'product_name' AS label,
      (al.reason::json)->>'instructor_name' AS instructor_name,
      'pass'::text AS entry_type
    FROM access_logs al
    JOIN access_passes ap ON ap.id = al.pass_id
    WHERE ap.participant_id = p_participant_id
      AND al.result = 'ok'
  ),
  lesson_entries AS (
    SELECT
      l.used_at,
      l.lesson_date::text AS session_date,
      l.start_time::text AS start_time,
      'שיעור פרטי'::text AS label,
      l.instructor_name,
      'lesson'::text AS entry_type
    FROM lessons l
    WHERE l.participant_id = p_participant_id
      AND l.used = TRUE
      AND l.used_at IS NOT NULL
  ),
  merged AS (
    SELECT * FROM pass_entries
    UNION ALL
    SELECT * FROM lesson_entries
  )
  SELECT COALESCE(
    json_agg(row_to_json(m) ORDER BY m.used_at DESC),
    '[]'::json
  )
  FROM (
    SELECT used_at, session_date, start_time, label, instructor_name, entry_type
    FROM merged
    ORDER BY used_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 12), 20))
  ) m;
$$;

-- ── verify_portal_pin ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_portal_pin(p_token uuid, p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row participants%ROWTYPE;
  v_decrypted text;
  v_nonce uuid;
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_row FROM participants WHERE portal_token = p_token FOR UPDATE;
  IF NOT FOUND OR v_row.portal_pin_enc IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_row.portal_locked_at IS NOT NULL THEN
    RETURN json_build_object('result', 'locked');
  END IF;

  v_decrypted := public.portal_decrypt_pin(v_row.portal_pin_enc);

  IF v_decrypted <> trim(p_pin) THEN
    UPDATE participants
    SET portal_failed_attempts = portal_failed_attempts + 1,
        portal_locked_at = CASE
          WHEN portal_failed_attempts + 1 >= 100 THEN NOW()
          ELSE portal_locked_at
        END
    WHERE id = v_row.id;

    IF v_row.portal_failed_attempts + 1 >= 100 THEN
      RETURN json_build_object('result', 'locked');
    END IF;

    RETURN json_build_object(
      'result', 'invalid_pin',
      'attempts_remaining', GREATEST(0, 100 - (v_row.portal_failed_attempts + 1))
    );
  END IF;

  UPDATE participants
  SET portal_failed_attempts = 0
  WHERE id = v_row.id;

  v_expires := public.portal_season_expires_at();
  v_nonce := gen_random_uuid();

  INSERT INTO portal_sessions (nonce, participant_id, expires_at)
  VALUES (v_nonce, v_row.id, v_expires);

  RETURN json_build_object(
    'result', 'ok',
    'session_nonce', v_nonce,
    'expires_at', v_expires,
    'participant_id', v_row.id
  );
END;
$$;

-- ── get_portal_dashboard ────────────────────────────────────
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
BEGIN
  v_participant_id := public.portal_validate_session(p_token, p_nonce);
  IF v_participant_id IS NULL THEN
    RETURN json_build_object('result', 'unauthorized');
  END IF;

  SELECT * INTO v_part FROM participants WHERE id = v_participant_id;
  SELECT * INTO v_family FROM families WHERE id = v_part.family_id;

  v_upcoming := public.get_portal_upcoming_entry(v_participant_id);
  v_history := public.get_portal_recent_entries(v_participant_id, 12);

  RETURN json_build_object(
    'result', 'ok',
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

-- ── update_portal_profile ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_portal_profile(p_token uuid, p_nonce uuid, p_payload json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
  v_part participants%ROWTYPE;
BEGIN
  v_participant_id := public.portal_validate_session(p_token, p_nonce);
  IF v_participant_id IS NULL THEN
    RETURN json_build_object('result', 'unauthorized');
  END IF;

  SELECT * INTO v_part FROM participants WHERE id = v_participant_id;

  UPDATE families
  SET
    parent_name = COALESCE(NULLIF(trim(p_payload->>'parent_name'), ''), parent_name),
    phone = COALESCE(NULLIF(trim(p_payload->>'phone'), ''), phone),
    email = CASE WHEN p_payload ? 'email' THEN NULLIF(trim(p_payload->>'email'), '') ELSE email END
  WHERE id = v_part.family_id;

  UPDATE participants
  SET
    full_name = COALESCE(NULLIF(trim(p_payload->>'full_name'), ''), full_name),
    birth_date = CASE
      WHEN p_payload ? 'birth_date' AND NULLIF(p_payload->>'birth_date', '') IS NOT NULL
      THEN (p_payload->>'birth_date')::date
      WHEN p_payload ? 'birth_date' THEN NULL
      ELSE birth_date
    END,
    gender = CASE WHEN p_payload ? 'gender' THEN NULLIF(p_payload->>'gender', '') ELSE gender END,
    grade = CASE WHEN p_payload ? 'grade' THEN NULLIF(p_payload->>'grade', '') ELSE grade END
  WHERE id = v_participant_id;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── set_portal_photo (registration only for parents) ────────
CREATE OR REPLACE FUNCTION public.set_portal_photo(
  p_token uuid,
  p_nonce uuid,
  p_photo_base64 text,
  p_mime text DEFAULT 'image/jpeg'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
  v_data bytea;
BEGIN
  v_participant_id := public.portal_validate_session(p_token, p_nonce);
  IF v_participant_id IS NULL THEN
    RETURN json_build_object('result', 'unauthorized');
  END IF;

  IF EXISTS (
    SELECT 1 FROM participants
    WHERE id = v_participant_id AND portal_photo_data IS NOT NULL
  ) THEN
    RETURN json_build_object('result', 'photo_exists');
  END IF;

  IF p_photo_base64 IS NULL OR length(p_photo_base64) = 0 THEN
    RETURN json_build_object('result', 'invalid_input');
  END IF;

  v_data := decode(p_photo_base64, 'base64');
  IF length(v_data) > 512000 THEN
    RETURN json_build_object('result', 'too_large');
  END IF;

  UPDATE participants
  SET
    portal_photo_data = v_data,
    portal_photo_mime = COALESCE(NULLIF(p_mime, ''), 'image/jpeg'),
    photo_uploaded_at = NOW()
  WHERE id = v_participant_id;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── Staff RPCs ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.staff_get_portal_credentials(p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row participants%ROWTYPE;
  v_pin text;
BEGIN
  IF NOT public.is_staff_portal_viewer() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM participants WHERE id = p_participant_id;
  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_row.portal_token IS NULL OR v_row.portal_pin_enc IS NULL THEN
    RETURN json_build_object('result', 'no_portal');
  END IF;

  v_pin := public.portal_decrypt_pin(v_row.portal_pin_enc);

  INSERT INTO portal_audit_log (participant_id, action, actor_id)
  VALUES (p_participant_id, 'view_credentials', auth.uid());

  RETURN json_build_object(
    'result', 'ok',
    'portal_token', v_row.portal_token,
    'portal_pin', v_pin,
    'portal_locked', v_row.portal_locked_at IS NOT NULL,
    'photo_url', public.portal_photo_data_url(v_row.portal_photo_data, v_row.portal_photo_mime),
    'photo_missing', v_row.portal_photo_data IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_reset_portal_pin(p_participant_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin text;
  v_token uuid;
BEGIN
  IF NOT public.is_staff_portal_admin() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_pin := public.generate_portal_pin();

  UPDATE participants
  SET
    portal_pin_enc = public.portal_encrypt_pin(v_pin),
    portal_failed_attempts = 0,
    portal_locked_at = NULL,
    portal_token = COALESCE(portal_token, gen_random_uuid())
  WHERE id = p_participant_id
  RETURNING portal_token INTO v_token;

  IF v_token IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  DELETE FROM portal_sessions WHERE participant_id = p_participant_id;

  INSERT INTO portal_audit_log (participant_id, action, actor_id)
  VALUES (p_participant_id, 'reset_pin', auth.uid());

  RETURN json_build_object(
    'result', 'ok',
    'portal_token', v_token,
    'portal_pin', v_pin
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_set_participant_photo(
  p_participant_id uuid,
  p_photo_base64 text,
  p_mime text DEFAULT 'image/jpeg'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data bytea;
BEGIN
  IF NOT public.is_staff_photo_editor() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF p_photo_base64 IS NULL OR length(p_photo_base64) = 0 THEN
    UPDATE participants
    SET portal_photo_data = NULL, portal_photo_mime = NULL, photo_uploaded_at = NULL
    WHERE id = p_participant_id;
    RETURN json_build_object('result', 'ok');
  END IF;

  v_data := decode(p_photo_base64, 'base64');
  IF length(v_data) > 512000 THEN
    RETURN json_build_object('result', 'too_large');
  END IF;

  UPDATE participants
  SET
    portal_photo_data = v_data,
    portal_photo_mime = COALESCE(NULLIF(p_mime, ''), 'image/jpeg'),
    photo_uploaded_at = NOW()
  WHERE id = p_participant_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── Participant photo for guard scan ────────────────────────
CREATE OR REPLACE FUNCTION public.participant_photo_meta(p_participant_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'photo_missing', portal_photo_data IS NULL,
    'photo_url', public.portal_photo_data_url(portal_photo_data, portal_photo_mime)
  )
  FROM participants
  WHERE id = p_participant_id;
$$;

-- ── redeem_lesson_qr ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_lesson_qr(p_qr_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_now timestamptz := NOW();
  v_earliest timestamptz;
  v_latest timestamptz;
  v_photo json;
BEGIN
  SELECT
    l.*,
    p.full_name AS participant_full_name,
    p.id AS pid
  INTO r
  FROM lessons l
  LEFT JOIN participants p ON p.id = l.participant_id
  WHERE l.qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF r.cancelled THEN
    RETURN json_build_object('result', 'cancelled', 'child_name', r.child_name);
  END IF;

  IF r.used THEN
    RETURN json_build_object(
      'result', 'already_used',
      'used_at', r.used_at,
      'child_name', r.child_name,
      'lesson_date', r.lesson_date,
      'start_time', r.start_time,
      'instructor_name', r.instructor_name
    );
  END IF;

  IF r.payment_status = 'unpaid' THEN
    RETURN json_build_object('result', 'unpaid', 'child_name', r.child_name);
  END IF;

  v_earliest := r.lesson_date::timestamptz + r.start_time - INTERVAL '30 minutes';
  v_latest := r.lesson_date::timestamptz + r.start_time + INTERVAL '30 minutes';

  IF v_now < v_earliest THEN
    RETURN json_build_object('result', 'too_early', 'child_name', r.child_name, 'valid_from', v_earliest);
  END IF;

  IF v_now > v_latest THEN
    RETURN json_build_object('result', 'too_late', 'child_name', r.child_name, 'valid_until', v_latest);
  END IF;

  UPDATE lessons
  SET used = TRUE, used_at = v_now
  WHERE id = r.id;

  PERFORM public.mark_lesson_scan_attendance(r.id);

  IF r.pid IS NOT NULL THEN
    v_photo := public.participant_photo_meta(r.pid);
  ELSE
    v_photo := json_build_object('photo_missing', TRUE, 'photo_url', NULL);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'child_name', r.child_name,
    'lesson_date', r.lesson_date,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'instructor_name', r.instructor_name,
    'participant_id', r.pid,
    'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
    'photo_url', v_photo->>'photo_url'
  );
END;
$$;

-- ── redeem_access_pass (photo fields) ───────────────────────
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
  v_photo json;
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
    e.active AS enrollment_active,
    s.active AS season_active
  INTO r
  FROM access_passes ap
  JOIN participants p ON p.id = ap.participant_id
  JOIN scheduled_sessions ss ON ss.id = ap.session_id
  JOIN products pr ON pr.id = ss.product_id
  JOIN seasons s ON s.id = pr.season_id
  JOIN enrollments e ON e.id = ap.enrollment_id
  WHERE ap.qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  v_photo := public.participant_photo_meta(r.participant_id);

  IF NOT r.season_active THEN
    RETURN json_build_object(
      'result', 'season_inactive',
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF r.pass_status = 'used' OR r.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'result', 'already_used',
      'used_at', r.used_at,
      'child_name', r.child_name,
      'session_date', r.session_date,
      'start_time', r.start_time,
      'product_name', r.product_name,
      'instructor_name', r.instructor_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF r.pass_status = 'cancelled' OR r.session_status = 'cancelled' THEN
    RETURN json_build_object(
      'result', 'cancelled',
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF NOT r.enrollment_active THEN
    RETURN json_build_object(
      'result', 'inactive',
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF r.payment_status = 'unpaid' THEN
    RETURN json_build_object(
      'result', 'unpaid',
      'child_name', r.child_name,
      'product_name', r.product_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF v_now < r.valid_from THEN
    RETURN json_build_object(
      'result', 'too_early',
      'valid_from', r.valid_from,
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF v_now > r.valid_until THEN
    RETURN json_build_object(
      'result', 'too_late',
      'valid_until', r.valid_until,
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
  END IF;

  IF r.pass_status <> 'active' THEN
    RETURN json_build_object(
      'result', 'expired',
      'child_name', r.child_name,
      'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
      'photo_url', v_photo->>'photo_url'
    );
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
    'payment_status', r.payment_status,
    'participant_id', r.participant_id,
    'photo_missing', COALESCE((v_photo->>'photo_missing')::boolean, TRUE),
    'photo_url', v_photo->>'photo_url'
  );
END;
$$;

-- ── Enrollment trigger (skip assessments) ───────────────────
CREATE OR REPLACE FUNCTION public.enrollment_ensure_portal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT pt.code INTO v_code
  FROM products p
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.id = NEW.product_id;

  IF v_code IS DISTINCT FROM 'swim_assessment' THEN
    PERFORM public.ensure_participant_portal(NEW.participant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enrollments_ensure_portal_trg ON enrollments;
CREATE TRIGGER enrollments_ensure_portal_trg
  AFTER INSERT ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.enrollment_ensure_portal();

-- ── Grants ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.portal_pin_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_encrypt_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_decrypt_pin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_validate_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_portal_pin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_photo_data_url(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_season_expires_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_upcoming_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_recent_entries(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.participant_photo_meta(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_portal_viewer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_portal_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_photo_editor() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_participant_portal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_portal_pin(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_dashboard(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_portal_profile(uuid, uuid, json) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_portal_photo(uuid, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_portal_credentials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reset_portal_pin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_participant_photo(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_lesson_qr(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_access_pass(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_access_pass(uuid) TO authenticated;

SELECT 'Child portal migration complete' AS status;


-- ── supabase_migration_leads_crm.sql ──

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


-- ── supabase_migration_price_list.sql ──

-- ============================================================
--  Stream Line — Central price list, customer tiers, billing
-- ============================================================

-- ── 1. Price list versions & items ──────────────────────────
CREATE TABLE IF NOT EXISTS price_list_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from  DATE NOT NULL,
  label           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS price_list_versions_effective_idx
  ON price_list_versions (effective_from DESC);

CREATE TABLE IF NOT EXISTS price_list_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id    UUID NOT NULL REFERENCES price_list_versions(id) ON DELETE CASCADE,
  product_code  TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('external', 'subscriber', 'shareholder')),
  amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (version_id, product_code, tier)
);

CREATE INDEX IF NOT EXISTS price_list_items_version_idx
  ON price_list_items (version_id, product_code);

-- ── 2. Customer status ───────────────────────────────────────
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS is_shareholder BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'external';

ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_membership_tier_check;
ALTER TABLE participants ADD CONSTRAINT participants_membership_tier_check
  CHECK (membership_tier IN ('external', 'subscriber'));

-- ── 3. Annual packages ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS participant_annual_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  season_id       UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  weekly_slots    SMALLINT NOT NULL CHECK (weekly_slots IN (1, 2)),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS participant_annual_packages_active_idx
  ON participant_annual_packages (participant_id, season_id)
  WHERE active = TRUE;

-- ── 4. Billing snapshots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id        UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  season_id             UUID REFERENCES seasons(id) ON DELETE SET NULL,
  billing_type          TEXT NOT NULL CHECK (billing_type IN ('annual_monthly', 'swim_course', 'private_package', 'private_lesson')),
  billing_month         DATE,
  enrollment_id         UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  private_package_id    UUID,
  lesson_id             UUID REFERENCES lessons(id) ON DELETE SET NULL,
  amount                NUMERIC(10,2) NOT NULL,
  sibling_discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  price_list_version_id UUID REFERENCES price_list_versions(id) ON DELETE SET NULL,
  product_code          TEXT,
  tier                  TEXT,
  payment_status        TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'waived')),
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_records_participant_idx
  ON billing_records (participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_records_paid_idx
  ON billing_records (payment_status, paid_at)
  WHERE payment_status = 'paid';

-- ── 5. Private lesson packages ───────────────────────────────
CREATE TABLE IF NOT EXISTS private_lesson_packages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  participant_id      UUID REFERENCES participants(id) ON DELETE SET NULL,
  package_code        TEXT NOT NULL CHECK (package_code IN ('private_5pack', 'private_10pack')),
  sessions_total      INT NOT NULL CHECK (sessions_total > 0),
  sessions_remaining  INT NOT NULL CHECK (sessions_remaining >= 0),
  amount_paid         NUMERIC(10,2) NOT NULL,
  purchased_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          DATE,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_by          UUID REFERENCES profiles(id)
);

ALTER TABLE billing_records
  DROP CONSTRAINT IF EXISTS billing_records_private_package_id_fkey;
ALTER TABLE billing_records
  ADD CONSTRAINT billing_records_private_package_id_fkey
  FOREIGN KEY (private_package_id) REFERENCES private_lesson_packages(id) ON DELETE SET NULL;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS private_package_id UUID REFERENCES private_lesson_packages(id) ON DELETE SET NULL;
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS lesson_format TEXT CHECK (lesson_format IN ('single', 'double', 'package_session'));

-- ── 6. Adult style improvement template ──────────────────────
INSERT INTO product_templates (
  code, name, duration_minutes,
  entry_window_before_minutes, entry_window_after_minutes,
  schedule_pattern
) VALUES (
  'adult_style_improvement',
  'שיפור סגנון למבוגרים',
  60, 30, 30,
  '{"type":"weekly"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- ── 7. RLS ───────────────────────────────────────────────────
ALTER TABLE price_list_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_annual_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_lesson_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_list_versions_select ON price_list_versions;
CREATE POLICY price_list_versions_select ON price_list_versions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_office());

DROP POLICY IF EXISTS price_list_versions_admin_write ON price_list_versions;
CREATE POLICY price_list_versions_admin_write ON price_list_versions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS price_list_items_select ON price_list_items;
CREATE POLICY price_list_items_select ON price_list_items
  FOR SELECT TO authenticated
  USING (public.is_admin_or_office());

DROP POLICY IF EXISTS price_list_items_admin_write ON price_list_items;
CREATE POLICY price_list_items_admin_write ON price_list_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS participant_annual_packages_staff ON participant_annual_packages;
CREATE POLICY participant_annual_packages_staff ON participant_annual_packages
  FOR ALL TO authenticated
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

DROP POLICY IF EXISTS billing_records_staff ON billing_records;
CREATE POLICY billing_records_staff ON billing_records
  FOR ALL TO authenticated
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

DROP POLICY IF EXISTS private_lesson_packages_staff ON private_lesson_packages;
CREATE POLICY private_lesson_packages_staff ON private_lesson_packages
  FOR ALL TO authenticated
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ── 8. Seed initial price list ───────────────────────────────
DO $$
DECLARE
  v_version_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM price_list_versions LIMIT 1) THEN
    INSERT INTO price_list_versions (effective_from, label)
    VALUES ('2026-05-01', 'מחירון 1/5/2026')
    RETURNING id INTO v_version_id;

    INSERT INTO price_list_items (version_id, product_code, tier, amount) VALUES
      (v_version_id, 'swim_course_12', 'external', 1600),
      (v_version_id, 'swim_course_12', 'subscriber', 1400),
      (v_version_id, 'swim_course_12', 'shareholder', 1250),
      (v_version_id, 'annual_monthly_1x', 'external', 309),
      (v_version_id, 'annual_monthly_1x', 'subscriber', 209),
      (v_version_id, 'annual_monthly_1x', 'shareholder', 209),
      (v_version_id, 'annual_monthly_2x', 'external', 409),
      (v_version_id, 'annual_monthly_2x', 'subscriber', 309),
      (v_version_id, 'annual_monthly_2x', 'shareholder', 309),
      (v_version_id, 'private_single', 'external', 200),
      (v_version_id, 'private_single', 'subscriber', 170),
      (v_version_id, 'private_single', 'shareholder', 170),
      (v_version_id, 'private_5pack', 'external', 950),
      (v_version_id, 'private_5pack', 'subscriber', 800),
      (v_version_id, 'private_5pack', 'shareholder', 800),
      (v_version_id, 'private_double', 'external', 380),
      (v_version_id, 'private_double', 'subscriber', 320),
      (v_version_id, 'private_double', 'shareholder', 320),
      (v_version_id, 'private_10pack', 'external', 1750),
      (v_version_id, 'private_10pack', 'subscriber', 1450),
      (v_version_id, 'private_10pack', 'shareholder', 1450),
      (v_version_id, 'adult_style_improvement', 'external', 0),
      (v_version_id, 'adult_style_improvement', 'subscriber', 0),
      (v_version_id, 'adult_style_improvement', 'shareholder', 0);
  END IF;
END $$;

-- ── 9. Helper: active version ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_price_list_version_id(p_as_of date DEFAULT CURRENT_DATE)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM price_list_versions
  WHERE effective_from <= COALESCE(p_as_of, CURRENT_DATE)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- ── 10. get_active_price_list (public read for landing) ──────
CREATE OR REPLACE FUNCTION public.get_active_price_list(p_as_of date DEFAULT CURRENT_DATE)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id UUID;
  v_version json;
  v_items json;
BEGIN
  v_version_id := public.get_active_price_list_version_id(p_as_of);
  IF v_version_id IS NULL THEN
    RETURN json_build_object('version', NULL, 'items', '[]'::json);
  END IF;

  SELECT json_build_object(
    'id', plv.id,
    'effective_from', plv.effective_from,
    'label', plv.label
  ) INTO v_version
  FROM price_list_versions plv
  WHERE plv.id = v_version_id;

  SELECT COALESCE(json_agg(json_build_object(
    'product_code', pli.product_code,
    'tier', pli.tier,
    'amount', pli.amount
  ) ORDER BY pli.product_code, pli.tier), '[]'::json)
  INTO v_items
  FROM price_list_items pli
  WHERE pli.version_id = v_version_id;

  RETURN json_build_object('version', v_version, 'items', v_items);
END;
$$;

-- ── 11. resolve_effective_tier ───────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_effective_tier(
  p_participant_id uuid,
  p_product_code text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership text;
  v_shareholder boolean;
BEGIN
  SELECT p.membership_tier, COALESCE(f.is_shareholder, FALSE)
  INTO v_membership, v_shareholder
  FROM participants p
  JOIN families f ON f.id = p.family_id
  WHERE p.id = p_participant_id;

  IF NOT FOUND THEN
    RETURN 'external';
  END IF;

  IF p_product_code = 'swim_course_12' AND v_shareholder THEN
    RETURN 'shareholder';
  END IF;

  IF v_shareholder THEN
    RETURN 'subscriber';
  END IF;

  RETURN COALESCE(v_membership, 'external');
END;
$$;

-- ── 12. get_price_list_amount ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_price_list_amount(
  p_product_code text,
  p_tier text,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id UUID;
  v_amount numeric;
  v_tier text := p_tier;
BEGIN
  IF p_product_code <> 'swim_course_12' AND v_tier = 'shareholder' THEN
    v_tier := 'subscriber';
  END IF;

  v_version_id := public.get_active_price_list_version_id(p_as_of);
  IF v_version_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT amount INTO v_amount
  FROM price_list_items
  WHERE version_id = v_version_id
    AND product_code = p_product_code
    AND tier = v_tier;

  RETURN v_amount;
END;
$$;

-- ── 13. sibling discount eligibility ─────────────────────────
CREATE OR REPLACE FUNCTION public.sibling_discount_eligible(
  p_participant_id uuid,
  p_enrollment_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_my_created timestamptz;
  v_has_older_sibling boolean;
BEGIN
  SELECT p.family_id INTO v_family_id
  FROM participants p WHERE p.id = p_participant_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF p_enrollment_id IS NOT NULL THEN
    SELECT e.created_at INTO v_my_created
    FROM enrollments e
    WHERE e.id = p_enrollment_id AND e.participant_id = p_participant_id;
    IF NOT FOUND THEN RETURN 0; END IF;
  ELSE
    v_my_created := now();
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM participants sib
    JOIN enrollments e ON e.participant_id = sib.id AND e.active = TRUE
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    WHERE sib.family_id = v_family_id
      AND sib.id <> p_participant_id
      AND pt.code IN ('annual_section', 'summer_course')
      AND e.created_at < v_my_created
  ) INTO v_has_older_sibling;

  IF NOT v_has_older_sibling THEN
    RETURN 0;
  END IF;

  IF p_enrollment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM enrollments e
      JOIN products pr ON pr.id = e.product_id
      JOIN product_templates pt ON pt.id = pr.template_id
      WHERE e.id = p_enrollment_id
        AND pt.code IN ('annual_section', 'summer_course')
    ) THEN
      RETURN 0;
    END IF;
  END IF;

  RETURN 10;
END;
$$;

-- ── 14. suggest_payment_amount ───────────────────────────────
CREATE OR REPLACE FUNCTION public.suggest_payment_amount(
  p_participant_id uuid,
  p_billing_type text,
  p_enrollment_id uuid DEFAULT NULL,
  p_billing_month date DEFAULT NULL,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_code text;
  v_tier text;
  v_base numeric;
  v_discount_pct numeric := 0;
  v_final numeric;
  v_version_id uuid;
  v_weekly_slots int;
  v_season_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  v_version_id := public.get_active_price_list_version_id(p_as_of);

  IF p_billing_type = 'swim_course' THEN
    v_product_code := 'swim_course_12';
    v_tier := public.resolve_effective_tier(p_participant_id, v_product_code);
    v_base := public.get_price_list_amount(v_product_code, v_tier, p_as_of);
    v_discount_pct := public.sibling_discount_eligible(p_participant_id, p_enrollment_id);

  ELSIF p_billing_type = 'annual_monthly' THEN
    SELECT pap.weekly_slots, pap.season_id
    INTO v_weekly_slots, v_season_id
    FROM participant_annual_packages pap
    WHERE pap.participant_id = p_participant_id
      AND pap.active = TRUE
    ORDER BY pap.created_at DESC
    LIMIT 1;

    IF v_weekly_slots IS NULL THEN
      RETURN json_build_object('error', 'no_annual_package');
    END IF;

    v_product_code := CASE WHEN v_weekly_slots = 2 THEN 'annual_monthly_2x' ELSE 'annual_monthly_1x' END;
    v_tier := public.resolve_effective_tier(p_participant_id, v_product_code);
    v_base := public.get_price_list_amount(v_product_code, v_tier, p_as_of);
    v_discount_pct := 0;
    IF p_enrollment_id IS NOT NULL THEN
      v_discount_pct := public.sibling_discount_eligible(p_participant_id, p_enrollment_id);
    END IF;

  ELSE
    RETURN json_build_object('error', 'invalid_billing_type');
  END IF;

  IF v_base IS NULL THEN
    RETURN json_build_object('error', 'no_price');
  END IF;

  v_final := ROUND(v_base * (1 - v_discount_pct / 100.0), 2);

  RETURN json_build_object(
    'product_code', v_product_code,
    'tier', v_tier,
    'base_amount', v_base,
    'sibling_discount_pct', v_discount_pct,
    'suggested_amount', v_final,
    'price_list_version_id', v_version_id,
    'billing_type', p_billing_type,
    'billing_month', p_billing_month
  );
END;
$$;

-- ── 15. record_billing_payment ───────────────────────────────
CREATE OR REPLACE FUNCTION public.record_billing_payment(
  p_participant_id uuid,
  p_billing_type text,
  p_amount numeric,
  p_payment_status text,
  p_enrollment_id uuid DEFAULT NULL,
  p_billing_month date DEFAULT NULL,
  p_season_id uuid DEFAULT NULL,
  p_product_code text DEFAULT NULL,
  p_tier text DEFAULT NULL,
  p_sibling_discount_pct numeric DEFAULT 0,
  p_price_list_version_id uuid DEFAULT NULL,
  p_private_package_id uuid DEFAULT NULL,
  p_lesson_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text := COALESCE(p_payment_status, 'paid');
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF v_status NOT IN ('paid', 'waived', 'unpaid') THEN
    RETURN json_build_object('error', 'invalid_status');
  END IF;

  INSERT INTO billing_records (
    participant_id, season_id, billing_type, billing_month,
    enrollment_id, private_package_id, lesson_id,
    amount, sibling_discount_pct, price_list_version_id,
    product_code, tier, payment_status, paid_at, notes, created_by
  ) VALUES (
    p_participant_id, p_season_id, p_billing_type, p_billing_month,
    p_enrollment_id, p_private_package_id, p_lesson_id,
    COALESCE(p_amount, 0), COALESCE(p_sibling_discount_pct, 0), p_price_list_version_id,
    p_product_code, p_tier, v_status,
    CASE WHEN v_status = 'paid' THEN now() ELSE NULL END,
    p_notes, auth.uid()
  )
  RETURNING id INTO v_id;

  IF p_enrollment_id IS NOT NULL AND v_status IN ('paid', 'waived') THEN
    UPDATE enrollments SET payment_status = v_status WHERE id = p_enrollment_id;
  END IF;

  IF p_lesson_id IS NOT NULL AND v_status IN ('paid', 'waived') THEN
    UPDATE lessons SET payment_status = v_status WHERE id = p_lesson_id;
  END IF;

  RETURN json_build_object('result', 'ok', 'billing_record_id', v_id);
END;
$$;

-- ── 16. Private package purchase ─────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_private_package(
  p_family_id uuid,
  p_package_code text,
  p_participant_id uuid DEFAULT NULL,
  p_amount_override numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_id uuid;
  v_tier text;
  v_amount numeric;
  v_total int;
  v_pkg_id uuid;
  v_version_id uuid;
  v_billing_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  v_participant_id := p_participant_id;
  IF v_participant_id IS NULL THEN
    SELECT id INTO v_participant_id
    FROM participants WHERE family_id = p_family_id
    ORDER BY created_at LIMIT 1;
  END IF;

  IF v_participant_id IS NULL THEN
    RETURN json_build_object('error', 'no_participant');
  END IF;

  v_tier := public.resolve_effective_tier(v_participant_id, p_package_code);
  v_amount := COALESCE(p_amount_override, public.get_price_list_amount(p_package_code, v_tier, CURRENT_DATE));
  v_version_id := public.get_active_price_list_version_id(CURRENT_DATE);

  v_total := CASE p_package_code
    WHEN 'private_5pack' THEN 5
    WHEN 'private_10pack' THEN 10
    ELSE NULL
  END;

  IF v_total IS NULL OR v_amount IS NULL THEN
    RETURN json_build_object('error', 'invalid_package');
  END IF;

  INSERT INTO private_lesson_packages (
    family_id, participant_id, package_code,
    sessions_total, sessions_remaining, amount_paid, created_by
  ) VALUES (
    p_family_id, p_participant_id, p_package_code,
    v_total, v_total, v_amount, auth.uid()
  )
  RETURNING id INTO v_pkg_id;

  INSERT INTO billing_records (
    participant_id, billing_type, private_package_id,
    amount, price_list_version_id, product_code, tier,
    payment_status, paid_at, created_by
  ) VALUES (
    v_participant_id, 'private_package', v_pkg_id,
    v_amount, v_version_id, p_package_code, v_tier,
    'paid', now(), auth.uid()
  )
  RETURNING id INTO v_billing_id;

  RETURN json_build_object(
    'result', 'ok',
    'package_id', v_pkg_id,
    'billing_record_id', v_billing_id,
    'amount', v_amount,
    'sessions_remaining', v_total
  );
END;
$$;

-- ── 17. consume_package_session ──────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_package_session(p_package_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int;
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT public.is_admin_or_office()
    AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'instructor'
    )
  THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  UPDATE private_lesson_packages
  SET sessions_remaining = sessions_remaining - 1,
      active = (sessions_remaining - 1) > 0
  WHERE id = p_package_id
    AND active = TRUE
    AND sessions_remaining > 0
  RETURNING sessions_remaining INTO v_remaining;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_sessions');
  END IF;

  RETURN json_build_object('result', 'ok', 'sessions_remaining', v_remaining);
END;
$$;

-- ── 18. suggest_private_lesson_price ─────────────────────────
CREATE OR REPLACE FUNCTION public.suggest_private_lesson_price(
  p_participant_id uuid,
  p_lesson_format text DEFAULT 'single',
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_tier text;
  v_amount numeric;
BEGIN
  v_code := CASE p_lesson_format
    WHEN 'double' THEN 'private_double'
    ELSE 'private_single'
  END;

  v_tier := public.resolve_effective_tier(p_participant_id, v_code);
  v_amount := public.get_price_list_amount(v_code, v_tier, p_as_of);

  RETURN json_build_object(
    'product_code', v_code,
    'tier', v_tier,
    'suggested_amount', v_amount,
    'price_list_version_id', public.get_active_price_list_version_id(p_as_of)
  );
END;
$$;

-- ── 19. Price list admin: list versions ──────────────────────
CREATE OR REPLACE FUNCTION public.list_price_list_versions()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', id, 'effective_from', effective_from,
      'label', label, 'created_at', created_at
    ) ORDER BY effective_from DESC)
    FROM price_list_versions
  ), '[]'::json);
END;
$$;

-- ── 20. Create new price list version (copy from latest) ─────
CREATE OR REPLACE FUNCTION public.create_price_list_version(
  p_effective_from date,
  p_label text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
  v_src_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  INSERT INTO price_list_versions (effective_from, label, created_by)
  VALUES (p_effective_from, p_label, auth.uid())
  RETURNING id INTO v_new_id;

  SELECT id INTO v_src_id
  FROM price_list_versions
  WHERE id <> v_new_id
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_src_id IS NOT NULL THEN
    INSERT INTO price_list_items (version_id, product_code, tier, amount)
    SELECT v_new_id, product_code, tier, amount
    FROM price_list_items
    WHERE version_id = v_src_id;
  END IF;

  RETURN json_build_object('result', 'ok', 'version_id', v_new_id);
END;
$$;

-- ── 21. Update single price list item ────────────────────────
CREATE OR REPLACE FUNCTION public.update_price_list_item(
  p_version_id uuid,
  p_product_code text,
  p_tier text,
  p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  INSERT INTO price_list_items (version_id, product_code, tier, amount)
  VALUES (p_version_id, p_product_code, p_tier, p_amount)
  ON CONFLICT (version_id, product_code, tier)
  DO UPDATE SET amount = EXCLUDED.amount;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── 22. Upsert annual package ────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_annual_package(
  p_participant_id uuid,
  p_season_id uuid,
  p_weekly_slots smallint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  UPDATE participant_annual_packages
  SET active = FALSE
  WHERE participant_id = p_participant_id
    AND season_id = p_season_id
    AND active = TRUE;

  INSERT INTO participant_annual_packages (participant_id, season_id, weekly_slots)
  VALUES (p_participant_id, p_season_id, p_weekly_slots)
  RETURNING id INTO v_id;

  RETURN json_build_object('result', 'ok', 'package_id', v_id);
END;
$$;

-- ── 23. Count annual enrollments for mismatch ────────────────
CREATE OR REPLACE FUNCTION public.count_annual_enrollments(
  p_participant_id uuid,
  p_season_id uuid
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE e.participant_id = p_participant_id
    AND e.active = TRUE
    AND pr.season_id = p_season_id
    AND pt.code = 'annual_section';
$$;

-- ── 24. Extend generate_operational_alerts ───────────────────
CREATE OR REPLACE FUNCTION public.generate_operational_alerts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_rec record;
  v_next_season_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT id INTO v_next_season_id
  FROM seasons
  WHERE start_date > COALESCE(
    (SELECT start_date FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1),
    CURRENT_DATE
  )
  ORDER BY start_date ASC
  LIMIT 1;

  -- 1. Consecutive absences
  FOR v_rec IN
    WITH ordered AS (
      SELECT ae.enrollment_id, ae.participant_id, ae.status,
        ROW_NUMBER() OVER (PARTITION BY ae.enrollment_id ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC) AS rn
      FROM attendance_events ae
      LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
      LEFT JOIN lessons l ON l.id = ae.lesson_id
      WHERE ae.status IN ('present', 'absent')
    ),
    streaks AS (
      SELECT enrollment_id, participant_id FROM ordered
      WHERE rn <= 3
      GROUP BY enrollment_id, participant_id
      HAVING COUNT(*) = 3 AND COUNT(*) FILTER (WHERE status = 'absent') = 3
    )
    SELECT s.enrollment_id, s.participant_id, p.full_name AS child_name
    FROM streaks s JOIN participants p ON p.id = s.participant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'consecutive_absences' AND oa.entity_type = 'enrollment'
        AND oa.entity_id = s.enrollment_id AND oa.acknowledged_at IS NULL
    )
  LOOP
    INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
    VALUES ('consecutive_absences', 'warn', 'enrollment', v_rec.enrollment_id,
      '3 היעדרויות ברצף: ' || v_rec.child_name,
      json_build_object('participant_id', v_rec.participant_id));
    v_inserted := v_inserted + 1;
  END LOOP;

  -- 2. Churn risk
  IF v_next_season_id IS NOT NULL THEN
    FOR v_rec IN
      WITH ordered AS (
        SELECT ae.enrollment_id, ae.participant_id, ae.status,
          ROW_NUMBER() OVER (PARTITION BY ae.enrollment_id ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC) AS rn
        FROM attendance_events ae
        JOIN enrollments e ON e.id = ae.enrollment_id AND e.active = TRUE
        LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        LEFT JOIN lessons l ON l.id = ae.lesson_id
        WHERE ae.status IN ('present', 'absent')
      ),
      at_risk AS (
        SELECT DISTINCT o.participant_id FROM ordered o
        WHERE o.rn <= 3
        GROUP BY o.enrollment_id, o.participant_id
        HAVING COUNT(*) FILTER (WHERE o.status = 'absent') >= 2
      )
      SELECT ar.participant_id, p.full_name AS child_name
      FROM at_risk ar JOIN participants p ON p.id = ar.participant_id
      WHERE NOT EXISTS (
        SELECT 1 FROM enrollments e JOIN products pr ON pr.id = e.product_id
        WHERE e.participant_id = ar.participant_id AND e.active = TRUE AND pr.season_id = v_next_season_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM operational_alerts oa
        WHERE oa.alert_type = 'churn_risk' AND oa.entity_type = 'participant'
          AND oa.entity_id = ar.participant_id AND oa.acknowledged_at IS NULL
      )
    LOOP
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES ('churn_risk', 'warn', 'participant', v_rec.participant_id,
        'סיכון עזיבה: ' || v_rec.child_name,
        json_build_object('participant_id', v_rec.participant_id, 'next_season_id', v_next_season_id));
      v_inserted := v_inserted + 1;
    END LOOP;
  END IF;

  -- 3. Capacity full
  FOR v_rec IN
    SELECT pr.id AS product_id, pr.name AS product_name, COUNT(e.id)::int AS enrolled, pr.capacity
    FROM products pr JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
    WHERE pr.capacity IS NOT NULL AND pr.capacity > 0
    GROUP BY pr.id, pr.name, pr.capacity HAVING COUNT(e.id) >= pr.capacity
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'capacity_full' AND oa.entity_type = 'product'
        AND oa.entity_id = v_rec.product_id AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES ('capacity_full', 'info', 'product', v_rec.product_id,
        'קבוצה מלאה: ' || v_rec.product_name,
        json_build_object('enrolled', v_rec.enrolled, 'capacity', v_rec.capacity));
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- 4. Capacity low
  FOR v_rec IN
    SELECT pr.id AS product_id, pr.name AS product_name, COUNT(e.id)::int AS enrolled, pr.capacity
    FROM products pr LEFT JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
    WHERE pr.capacity IS NOT NULL AND pr.capacity >= 4
    GROUP BY pr.id, pr.name, pr.capacity
    HAVING COUNT(e.id)::numeric / pr.capacity < 0.5
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'capacity_low' AND oa.entity_type = 'product'
        AND oa.entity_id = v_rec.product_id AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES ('capacity_low', 'warn', 'product', v_rec.product_id,
        'תפוסה נמוכה: ' || v_rec.product_name,
        json_build_object('enrolled', v_rec.enrolled, 'capacity', v_rec.capacity));
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- 5. Package mismatch (annual)
  FOR v_rec IN
    SELECT
      pap.participant_id,
      pap.season_id,
      pap.weekly_slots,
      public.count_annual_enrollments(pap.participant_id, pap.season_id) AS enrolled_count,
      p.full_name AS child_name
    FROM participant_annual_packages pap
    JOIN participants p ON p.id = pap.participant_id
    WHERE pap.active = TRUE
      AND pap.weekly_slots <> public.count_annual_enrollments(pap.participant_id, pap.season_id)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'package_mismatch' AND oa.entity_type = 'participant'
        AND oa.entity_id = v_rec.participant_id AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES (
        'package_mismatch', 'warn', 'participant', v_rec.participant_id,
        'חוסר התאמה חבילה: ' || v_rec.child_name,
        json_build_object(
          'weekly_slots', v_rec.weekly_slots,
          'enrolled_count', v_rec.enrolled_count,
          'season_id', v_rec.season_id
        )
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'inserted', v_inserted);
END;
$$;

-- ── 25. get_revenue_breakdown (billing_records) ──────────────
CREATE OR REPLACE FUNCTION public.get_revenue_breakdown(
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_domain json;
  v_monthly json;
  v_avg numeric;
  v_paying integer;
  v_total numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.domain), '[]'::json)
  INTO v_by_domain
  FROM (
    SELECT
      CASE br.billing_type
        WHEN 'annual_monthly' THEN 'annual'
        WHEN 'swim_course' THEN 'summer'
        WHEN 'private_package' THEN 'private'
        WHEN 'private_lesson' THEN 'private'
        ELSE br.billing_type
      END AS domain,
      COUNT(*) FILTER (WHERE br.payment_status = 'paid')::int AS paid_count,
      COALESCE(SUM(CASE WHEN br.payment_status = 'paid' THEN br.amount ELSE 0 END), 0)::numeric(12,2) AS revenue
    FROM billing_records br
    WHERE br.payment_status = 'paid'
      AND COALESCE(br.paid_at::date, br.created_at::date) BETWEEN p_from AND p_to
    GROUP BY 1
    UNION ALL
    SELECT 'legacy_enrollment', COUNT(*)::int,
      COALESCE(SUM(COALESCE(p.price, 0)), 0)::numeric(12,2)
    FROM enrollments e
    JOIN products p ON p.id = e.product_id
    WHERE e.payment_status = 'paid' AND e.active = TRUE
      AND e.valid_from BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.enrollment_id = e.id)
    UNION ALL
    SELECT 'legacy_private', COUNT(*)::int,
      COALESCE(SUM(COALESCE(l.price, 0)), 0)::numeric(12,2)
    FROM lessons l
    WHERE l.payment_status = 'paid' AND NOT l.cancelled
      AND l.lesson_date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.lesson_id = l.id)
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month_start), '[]'::json)
  INTO v_monthly
  FROM (
    SELECT date_trunc('month', sub.dt)::date AS month_start,
      COALESCE(SUM(sub.amount), 0)::numeric(12,2) AS revenue
    FROM (
      SELECT COALESCE(br.paid_at::date, br.created_at::date) AS dt,
        CASE WHEN br.payment_status = 'paid' THEN br.amount ELSE 0 END AS amount
      FROM billing_records br
      WHERE br.payment_status = 'paid'
        AND COALESCE(br.paid_at::date, br.created_at::date) BETWEEN p_from AND p_to
      UNION ALL
      SELECT e.valid_from, COALESCE(p.price, 0)
      FROM enrollments e JOIN products p ON p.id = e.product_id
      WHERE e.payment_status = 'paid' AND e.active = TRUE AND e.valid_from BETWEEN p_from AND p_to
        AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.enrollment_id = e.id)
      UNION ALL
      SELECT l.lesson_date, COALESCE(l.price, 0)
      FROM lessons l
      WHERE l.payment_status = 'paid' AND NOT l.cancelled AND l.lesson_date BETWEEN p_from AND p_to
        AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.lesson_id = l.id)
    ) sub
    WHERE sub.amount > 0
    GROUP BY 1
  ) t;

  SELECT COUNT(DISTINCT payer_id)::int, COALESCE(SUM(rev), 0)::numeric(12,2)
  INTO v_paying, v_total
  FROM (
    SELECT br.participant_id AS payer_id,
      CASE WHEN br.payment_status = 'paid' THEN br.amount ELSE 0 END AS rev
    FROM billing_records br
    WHERE br.payment_status = 'paid'
      AND COALESCE(br.paid_at::date, br.created_at::date) BETWEEN p_from AND p_to
    UNION ALL
    SELECT e.participant_id, COALESCE(p.price, 0)
    FROM enrollments e JOIN products p ON p.id = e.product_id
    WHERE e.payment_status = 'paid' AND e.active = TRUE AND e.valid_from BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.enrollment_id = e.id)
    UNION ALL
    SELECT NULL::uuid, COALESCE(l.price, 0)
    FROM lessons l
    WHERE l.payment_status = 'paid' AND NOT l.cancelled AND l.lesson_date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.lesson_id = l.id)
  ) payers;

  v_avg := CASE WHEN v_paying > 0 THEN ROUND(v_total / v_paying, 2) ELSE 0 END;

  RETURN json_build_object(
    'from', p_from, 'to', p_to,
    'by_domain', v_by_domain, 'monthly', v_monthly,
    'total_revenue', v_total, 'paying_customers', v_paying,
    'avg_revenue_per_customer', v_avg
  );
END;
$$;

-- ── 26. get_revenue_by_season (billing + legacy) ─────────────
CREATE OR REPLACE FUNCTION public.get_revenue_by_season(p_season_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.season_name)
    FROM (
      SELECT
        s.id AS season_id,
        s.name AS season_name,
        COUNT(DISTINCT br.id) FILTER (WHERE br.payment_status = 'paid')::int AS paid_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.payment_status = 'unpaid' AND e.active)::int AS unpaid_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.payment_status = 'waived' AND e.active)::int AS waived_count,
        (
          COALESCE(SUM(br.amount) FILTER (WHERE br.payment_status = 'paid' AND br.season_id = s.id), 0)
          + COALESCE((
            SELECT SUM(COALESCE(p2.price, 0))
            FROM enrollments e2 JOIN products p2 ON p2.id = e2.product_id
            WHERE e2.payment_status = 'paid' AND e2.active AND p2.season_id = s.id
              AND NOT EXISTS (SELECT 1 FROM billing_records br2 WHERE br2.enrollment_id = e2.id)
          ), 0)
        )::numeric(12,2) AS gross_revenue
      FROM seasons s
      LEFT JOIN billing_records br ON br.season_id = s.id
      LEFT JOIN products pr ON pr.season_id = s.id
      LEFT JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
      WHERE p_season_id IS NULL OR s.id = p_season_id
      GROUP BY s.id, s.name
    ) t
  ), '[]'::json);
END;
$$;

-- ── 27. Backfill legacy paid records ─────────────────────────
INSERT INTO billing_records (
  participant_id, season_id, billing_type, enrollment_id,
  amount, product_code, tier, payment_status, paid_at, notes
)
SELECT
  e.participant_id,
  pr.season_id,
  CASE WHEN pt.code = 'summer_course' THEN 'swim_course' ELSE 'annual_monthly' END,
  e.id,
  COALESCE(pr.price, 0),
  CASE WHEN pt.code = 'summer_course' THEN 'swim_course_12' ELSE 'annual_monthly_1x' END,
  'external',
  e.payment_status,
  e.created_at,
  'backfill from enrollment'
FROM enrollments e
JOIN products pr ON pr.id = e.product_id
JOIN product_templates pt ON pt.id = pr.template_id
WHERE e.payment_status IN ('paid', 'waived')
  AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.enrollment_id = e.id);

INSERT INTO billing_records (
  participant_id, billing_type, lesson_id, amount,
  product_code, tier, payment_status, paid_at, notes
)
SELECT
  COALESCE((
    SELECT p.id FROM participants p
    JOIN families f ON f.id = p.family_id
    WHERE f.phone = l.parent_phone
    ORDER BY p.created_at LIMIT 1
  ), (SELECT id FROM participants ORDER BY created_at LIMIT 1)),
  'private_lesson',
  l.id,
  COALESCE(l.price, 0),
  'private_single',
  'external',
  l.payment_status,
  l.created_at,
  'backfill from lesson'
FROM lessons l
WHERE l.payment_status IN ('paid', 'waived')
  AND NOT EXISTS (SELECT 1 FROM billing_records br WHERE br.lesson_id = l.id)
  AND EXISTS (
    SELECT 1 FROM participants p
    JOIN families f ON f.id = p.family_id
    WHERE f.phone = l.parent_phone
  );

-- ── 28. Grants ───────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_active_price_list(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_price_list(date) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_active_price_list_version_id(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_price_list_version_id(date) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_effective_tier(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_effective_tier(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_price_list_amount(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_price_list_amount(text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.sibling_discount_eligible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sibling_discount_eligible(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.suggest_payment_amount(uuid, text, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_payment_amount(uuid, text, uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.record_billing_payment(uuid, text, numeric, text, uuid, date, uuid, text, text, numeric, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_billing_payment(uuid, text, numeric, text, uuid, date, uuid, text, text, numeric, uuid, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.purchase_private_package(uuid, text, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_private_package(uuid, text, uuid, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.consume_package_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_package_session(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.suggest_private_lesson_price(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_private_lesson_price(uuid, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.list_price_list_versions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_price_list_versions() TO authenticated;

REVOKE ALL ON FUNCTION public.create_price_list_version(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_price_list_version(date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_price_list_item(uuid, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_price_list_item(uuid, text, text, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_annual_package(uuid, uuid, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_annual_package(uuid, uuid, smallint) TO authenticated;

REVOKE ALL ON FUNCTION public.count_annual_enrollments(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_annual_enrollments(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_by_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_season(uuid) TO authenticated;

SELECT 'Price list migration complete' AS status;


-- ── supabase_migration_waitlist.sql ──

-- ============================================================
--  Stream Line OS — Waitlist
--  רשימת המתנה למבדק, קיץ וחוג + הצעות הרשמה
-- ============================================================

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         UUID REFERENCES families(id) ON DELETE SET NULL,
  participant_id    UUID REFERENCES participants(id) ON DELETE SET NULL,
  target_type       TEXT NOT NULL CHECK (target_type IN ('assessment_slot', 'product')),
  target_id         UUID NOT NULL,
  position          INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'notified', 'promoted', 'expired', 'cancelled')),
  phone             TEXT NOT NULL,
  parent_name       TEXT,
  child_name        TEXT NOT NULL,
  child_age         INTEGER,
  summer_invite_token UUID,
  offer_token       UUID UNIQUE,
  offer_expires_at  TIMESTAMPTZ,
  notified_at       TIMESTAMPTZ,
  promoted_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS waitlist_entries_target_idx
  ON waitlist_entries (target_type, target_id, status, position);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_active_participant_idx
  ON waitlist_entries (participant_id, target_type, target_id)
  WHERE status IN ('waiting', 'notified');

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_active_phone_slot_idx
  ON waitlist_entries (phone, target_type, target_id)
  WHERE status IN ('waiting', 'notified') AND target_type = 'assessment_slot';

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read waitlist"
  ON waitlist_entries FOR SELECT
  USING (public.is_admin_or_office());

CREATE POLICY "admin manage waitlist"
  ON waitlist_entries FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

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

-- ── get waitlist offer (public) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_waitlist_offer(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_entry record;
BEGIN
  SELECT * INTO v_entry
  FROM waitlist_entries
  WHERE offer_token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_entry.status NOT IN ('notified', 'promoted') THEN
    RETURN json_build_object('result', 'invalid');
  END IF;

  IF v_entry.offer_expires_at < NOW() AND v_entry.status <> 'promoted' THEN
    RETURN json_build_object('result', 'expired');
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'target_type', v_entry.target_type,
    'target_id', v_entry.target_id,
    'child_name', v_entry.child_name,
    'parent_name', v_entry.parent_name,
    'phone', v_entry.phone,
    'child_age', v_entry.child_age,
    'summer_invite_token', v_entry.summer_invite_token,
    'already_promoted', v_entry.status = 'promoted'
  );
END;
$$;

-- ── register from waitlist offer ───────────────────────────────
CREATE OR REPLACE FUNCTION public.register_from_waitlist_offer(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry record;
  v_slot record;
  v_product record;
  v_product_id uuid;
  v_session_id uuid;
  v_enrollment_id uuid;
  v_public_token uuid;
  v_qr_token uuid;
  v_template record;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_pattern jsonb;
  v_enrolled integer;
  v_assessment_data json;
BEGIN
  SELECT * INTO v_entry
  FROM waitlist_entries
  WHERE offer_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_entry.status = 'promoted' THEN
    RETURN json_build_object('result', 'already_used');
  END IF;

  IF v_entry.status <> 'notified' OR v_entry.offer_expires_at < NOW() THEN
    RETURN json_build_object('result', 'expired');
  END IF;

  IF NOT public.target_has_spot(v_entry.target_type, v_entry.target_id) THEN
    RETURN json_build_object('result', 'spot_taken');
  END IF;

  IF v_entry.target_type = 'assessment_slot' THEN
    SELECT * INTO v_slot FROM assessment_slots WHERE id = v_entry.target_id FOR UPDATE;

    IF NOT v_slot.active OR v_slot.slot_date < CURRENT_DATE THEN
      RETURN json_build_object('result', 'target_unavailable');
    END IF;

    IF v_slot.enrolled_count >= v_slot.capacity THEN
      RETURN json_build_object('result', 'slot_full');
    END IF;

    v_product_id := public.ensure_assessment_product();

    IF v_slot.session_id IS NULL THEN
      v_session_id := public.sync_assessment_slot_session(v_entry.target_id);
    ELSE
      v_session_id := v_slot.session_id;
    END IF;

    SELECT * INTO v_template FROM product_templates WHERE code = 'swim_assessment';

    IF EXISTS (
      SELECT 1 FROM enrollments
      WHERE participant_id = v_entry.participant_id
        AND product_id = v_product_id AND active = TRUE
    ) THEN
      RETURN json_build_object('result', 'duplicate_enrollment');
    END IF;

    INSERT INTO enrollments (
      product_id, participant_id, payment_status,
      valid_from, valid_until, active
    ) VALUES (
      v_product_id, v_entry.participant_id, 'waived',
      v_slot.slot_date, v_slot.slot_date, TRUE
    )
    RETURNING id INTO v_enrollment_id;

    INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
    VALUES (v_session_id, v_enrollment_id, v_entry.participant_id)
    ON CONFLICT (session_id, enrollment_id) DO NOTHING;

    v_valid_from := (v_slot.slot_date + v_slot.start_time)
      - make_interval(mins => COALESCE(v_template.entry_window_before_minutes, 30));
    v_valid_until := (v_slot.slot_date + v_slot.start_time)
      + make_interval(mins => COALESCE(v_template.duration_minutes, 30)
        + COALESCE(v_template.entry_window_after_minutes, 30));

    INSERT INTO access_passes (
      session_id, enrollment_id, participant_id,
      valid_from, valid_until, status
    ) VALUES (
      v_session_id, v_enrollment_id, v_entry.participant_id,
      v_valid_from, v_valid_until, 'active'
    )
    RETURNING public_token, qr_token INTO v_public_token, v_qr_token;

    INSERT INTO assessment_leads (
      slot_id, enrollment_id, participant_id, child_age, status, source
    ) VALUES (
      v_entry.target_id, v_enrollment_id, v_entry.participant_id,
      v_entry.child_age, 'registered_assessment', 'website'
    );

    UPDATE assessment_slots
    SET enrolled_count = enrolled_count + 1
    WHERE id = v_entry.target_id;

    UPDATE waitlist_entries
    SET status = 'promoted', promoted_at = NOW()
    WHERE id = v_entry.id;

    RETURN json_build_object(
      'result', 'ok',
      'type', 'assessment',
      'public_token', v_public_token,
      'qr_token', v_qr_token,
      'child_name', v_entry.child_name,
      'session_date', v_slot.slot_date,
      'start_time', v_slot.start_time
    );
  END IF;

  IF v_entry.target_type = 'product' THEN
    IF v_entry.summer_invite_token IS NULL THEN
      RETURN json_build_object('result', 'invalid_offer');
    END IF;

    SELECT p.*, pt.code AS template_code
    INTO v_product
    FROM products p
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE p.id = v_entry.target_id;

    IF NOT FOUND OR v_product.template_code <> 'summer_course' THEN
      RETURN json_build_object('result', 'invalid_product');
    END IF;

    SELECT COUNT(*) INTO v_enrolled
    FROM enrollments WHERE product_id = v_entry.target_id AND active = TRUE;

    IF v_product.capacity IS NOT NULL AND v_enrolled >= v_product.capacity THEN
      RETURN json_build_object('result', 'course_full');
    END IF;

    v_pattern := public.effective_schedule_pattern(v_entry.target_id);

    IF EXISTS (
      SELECT 1 FROM enrollments
      WHERE participant_id = v_entry.participant_id
        AND product_id = v_entry.target_id AND active = TRUE
    ) THEN
      RETURN json_build_object('result', 'duplicate_enrollment');
    END IF;

    INSERT INTO enrollments (
      product_id, participant_id, payment_status,
      valid_from, valid_until, active
    ) VALUES (
      v_entry.target_id,
      v_entry.participant_id,
      'unpaid',
      COALESCE((v_pattern->>'course_start')::date, CURRENT_DATE),
      COALESCE((v_pattern->>'course_end')::date, CURRENT_DATE + 60),
      TRUE
    )
    RETURNING id INTO v_enrollment_id;

    PERFORM public.generate_course_series_sessions(v_entry.target_id);
    PERFORM public.generate_access_passes(
      CURRENT_DATE,
      COALESCE((v_pattern->>'course_end')::date, CURRENT_DATE + 60)
    );

    SELECT ap.public_token INTO v_public_token
    FROM access_passes ap
    JOIN scheduled_sessions ss ON ss.id = ap.session_id
    WHERE ap.enrollment_id = v_enrollment_id
      AND ap.status = 'active'
      AND ss.session_date >= CURRENT_DATE
    ORDER BY ss.session_date, ss.start_time
    LIMIT 1;

    UPDATE summer_invitations
    SET used_at = NOW(), enrollment_id = v_enrollment_id
    WHERE token = v_entry.summer_invite_token AND used_at IS NULL;

    UPDATE waitlist_entries
    SET status = 'promoted', promoted_at = NOW()
    WHERE id = v_entry.id;

    RETURN json_build_object(
      'result', 'ok',
      'type', 'summer',
      'public_token', v_public_token,
      'child_name', v_entry.child_name
    );
  END IF;

  RETURN json_build_object('result', 'invalid_target');
END;
$$;

-- ── cancel enrollment + promote waitlist ─────────────────────
CREATE OR REPLACE FUNCTION public.cancel_enrollment(p_enrollment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment record;
  v_lead record;
  v_product_id uuid;
  v_slot_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_enrollment
  FROM enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_enrollment.active THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  v_product_id := v_enrollment.product_id;

  UPDATE enrollments SET active = FALSE WHERE id = p_enrollment_id;

  UPDATE access_passes
  SET status = 'cancelled'
  WHERE enrollment_id = p_enrollment_id AND status = 'active';

  SELECT al.slot_id INTO v_slot_id
  FROM assessment_leads al
  WHERE al.enrollment_id = p_enrollment_id
  LIMIT 1;

  IF v_slot_id IS NOT NULL THEN
    UPDATE assessment_slots
    SET enrolled_count = GREATEST(enrolled_count - 1, 0)
    WHERE id = v_slot_id;
    PERFORM public.try_promote_waitlist('assessment_slot', v_slot_id);
  ELSE
    PERFORM public.try_promote_waitlist('product', v_product_id);
  END IF;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── updated list_assessment_slots (include full) ─────────────
CREATE OR REPLACE FUNCTION public.list_assessment_slots()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.slot_date, t.start_time)
      FROM (
        SELECT
          id,
          slot_date,
          start_time,
          capacity,
          enrolled_count,
          GREATEST(capacity - enrolled_count, 0) AS spots_left,
          (enrolled_count >= capacity) AS is_full
        FROM assessment_slots
        WHERE active = TRUE
          AND slot_date >= CURRENT_DATE
        ORDER BY slot_date, start_time
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── updated get_summer_invite (include full courses) ─────────
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
            END AS spots_left,
            (p.capacity IS NOT NULL AND COALESCE(enr.cnt, 0) >= p.capacity) AS is_full
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
      ),
      '[]'::json
    )
  );
END;
$$;

-- ── updated update_lead_crm — promote waitlist on abandon ────
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
  v_slot_id uuid;
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
    v_slot_id := COALESCE(v_lead.slot_id, p_slot_id);
    IF v_slot_id IS NOT NULL THEN
      UPDATE assessment_slots SET enrolled_count = GREATEST(enrolled_count - 1, 0)
        WHERE id = v_slot_id;
      PERFORM public.try_promote_waitlist('assessment_slot', v_slot_id);
    END IF;
  END IF;

  RETURN json_build_object('result', 'ok', 'lead_id', p_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.join_waitlist(text, uuid, text, text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waitlist(text, uuid, text, text, text, integer, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.leave_waitlist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_waitlist(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.list_waitlist(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_waitlist(text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_pending_waitlist_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_waitlist_notifications() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_waitlist_notified(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_waitlist_notified(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_waitlist_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_waitlist_offer(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.register_from_waitlist_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_from_waitlist_offer(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_enrollment(uuid) TO authenticated;

SELECT 'Waitlist migration complete' AS status;


-- ── supabase_migration_utilization_makeup.sql ──

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


-- ── supabase_migration_instructor_payroll.sql ──

-- ============================================================
--  Instructor payroll — שעות עבודה ודוח שכר
-- ============================================================

CREATE TABLE IF NOT EXISTS instructor_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_code text NOT NULL,
  rate_per_hour numeric(10,2) NOT NULL CHECK (rate_per_hour >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, template_code)
);

CREATE INDEX IF NOT EXISTS idx_instructor_pay_rates_instructor
  ON instructor_pay_rates (instructor_id);

ALTER TABLE instructor_pay_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instructor_pay_rates_select ON instructor_pay_rates;
CREATE POLICY instructor_pay_rates_select ON instructor_pay_rates
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR instructor_id = auth.uid()
  );

DROP POLICY IF EXISTS instructor_pay_rates_admin_write ON instructor_pay_rates;
CREATE POLICY instructor_pay_rates_admin_write ON instructor_pay_rates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── duration helper ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_session_duration_minutes(
  p_template_code text,
  p_start_time time,
  p_end_time time
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_mins int;
BEGIN
  IF p_template_code IN ('swim_assessment', 'private_lesson') THEN
    RETURN 30;
  END IF;

  IF p_start_time IS NOT NULL AND p_end_time IS NOT NULL THEN
    v_mins := EXTRACT(EPOCH FROM (p_end_time - p_start_time))::int / 60;
    IF v_mins > 0 THEN
      RETURN v_mins;
    END IF;
  END IF;

  RETURN 30;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_session_duration_minutes(text, time, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_session_duration_minutes(text, time, time) TO authenticated;

-- ── work sessions (attendance marked only) ───────────────────
CREATE OR REPLACE FUNCTION public.get_instructor_work_sessions(
  p_from date,
  p_to date,
  p_instructor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF public.is_admin() THEN
    v_target := p_instructor_id;
  ELSE
    v_target := v_uid;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.session_date, t.start_time, t.title), '[]'::json)
  INTO v_rows
  FROM (
  SELECT
    w.instructor_id,
    p.full_name AS instructor_name,
    w.session_type,
    w.session_id,
    w.lesson_id,
    w.scheduled_session_id,
    w.session_date,
    w.start_time,
    w.title,
    w.template_code,
    w.duration_minutes,
    ROUND(w.duration_minutes / 60.0, 2) AS duration_hours,
    w.marked_at,
    ipr.rate_per_hour AS pay_rate,
    CASE
      WHEN ipr.rate_per_hour IS NOT NULL
      THEN ROUND((w.duration_minutes / 60.0) * ipr.rate_per_hour, 2)
      ELSE NULL
    END AS pay_amount
  FROM (
    -- group sessions (non-assessment)
    SELECT
      pr.instructor_id,
      'group'::text AS session_type,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      ss.id AS scheduled_session_id,
      ss.session_date,
      ss.start_time,
      pr.name AS title,
      pt.code AS template_code,
      public.resolve_session_duration_minutes(pt.code, ss.start_time, ss.end_time) AS duration_minutes,
      MAX(sa.attendance_marked_at) AS marked_at
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN session_attendees sa ON sa.session_id = ss.id
    WHERE ss.status <> 'cancelled'
      AND pt.code <> 'swim_assessment'
      AND pr.instructor_id IS NOT NULL
      AND sa.attendance_status IN ('present', 'absent', 'excused', 'late')
      AND ss.session_date BETWEEN p_from AND p_to
    GROUP BY ss.id, pr.instructor_id, pr.name, pt.code, ss.session_date, ss.start_time, ss.end_time

    UNION ALL

    -- private lessons
    SELECT
      l.instructor_id,
      'private'::text AS session_type,
      l.id AS session_id,
      l.id AS lesson_id,
      NULL::uuid AS scheduled_session_id,
      l.lesson_date AS session_date,
      l.start_time,
      l.child_name AS title,
      'private_lesson'::text AS template_code,
      public.resolve_session_duration_minutes('private_lesson', l.start_time, l.end_time) AS duration_minutes,
      l.attendance_marked_at AS marked_at
    FROM lessons l
    WHERE NOT l.cancelled
      AND l.instructor_id IS NOT NULL
      AND l.attendance_status IN ('present', 'absent', 'excused', 'late')
      AND l.lesson_date BETWEEN p_from AND p_to

    UNION ALL

    -- swim assessments — attribute to instructor who marked attendance
    SELECT
      marker.instructor_id,
      'group'::text AS session_type,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      ss.id AS scheduled_session_id,
      ss.session_date,
      ss.start_time,
      COALESCE(pr.name, 'מבדק') AS title,
      'swim_assessment'::text AS template_code,
      public.resolve_session_duration_minutes('swim_assessment', ss.start_time, ss.end_time) AS duration_minutes,
      marker.marked_at
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN LATERAL (
      SELECT
        sa.attendance_marked_by AS instructor_id,
        MAX(sa.attendance_marked_at) AS marked_at
      FROM session_attendees sa
      WHERE sa.session_id = ss.id
        AND sa.attendance_status IN ('present', 'absent', 'excused', 'late')
        AND sa.attendance_marked_by IS NOT NULL
      GROUP BY sa.attendance_marked_by
      ORDER BY COUNT(*) DESC, MAX(sa.attendance_marked_at) DESC
      LIMIT 1
    ) marker ON true
    WHERE ss.status <> 'cancelled'
      AND pt.code = 'swim_assessment'
      AND ss.session_date BETWEEN p_from AND p_to
  ) w
  JOIN profiles p ON p.id = w.instructor_id
  LEFT JOIN instructor_pay_rates ipr
    ON ipr.instructor_id = w.instructor_id
   AND ipr.template_code = w.template_code
  WHERE v_target IS NULL OR w.instructor_id = v_target
  ) t;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_instructor_work_sessions(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_work_sessions(date, date, uuid) TO authenticated;

-- ── monthly payroll summary ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_instructor_payroll_summary(
  p_from date,
  p_to date,
  p_instructor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF public.is_admin() THEN
    v_target := p_instructor_id;
  ELSE
    v_target := v_uid;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(inst) ORDER BY inst.instructor_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      base.instructor_id,
      base.instructor_name,
      COALESCE(
        (
          SELECT json_agg(row_to_json(bt) ORDER BY bt.template_code)
          FROM (
            SELECT
              s.template_code,
              COUNT(*)::int AS session_count,
              ROUND(SUM(s.duration_minutes) / 60.0, 2) AS total_hours,
              ipr.rate_per_hour,
              CASE
                WHEN ipr.rate_per_hour IS NOT NULL
                THEN ROUND(SUM(s.duration_minutes / 60.0) * ipr.rate_per_hour, 2)
                ELSE NULL
              END AS total_pay
            FROM (
              SELECT
                (elem->>'instructor_id')::uuid AS instructor_id,
                elem->>'template_code' AS template_code,
                (elem->>'duration_minutes')::int AS duration_minutes
              FROM json_array_elements(public.get_instructor_work_sessions(p_from, p_to, v_target)) elem
            ) s
            LEFT JOIN instructor_pay_rates ipr
              ON ipr.instructor_id = s.instructor_id
             AND ipr.template_code = s.template_code
            WHERE s.instructor_id = base.instructor_id
            GROUP BY s.template_code, ipr.rate_per_hour
          ) bt
        ),
        '[]'::json
      ) AS by_template,
      ROUND(SUM(base.duration_minutes) / 60.0, 2) AS total_hours,
      (
        SELECT ROUND(SUM(sub.pay_amount), 2)
        FROM (
          SELECT (elem->>'pay_amount')::numeric AS pay_amount
          FROM json_array_elements(public.get_instructor_work_sessions(p_from, p_to, base.instructor_id)) elem
        ) sub
        WHERE sub.pay_amount IS NOT NULL
      ) AS total_pay,
      EXISTS (
        SELECT 1
        FROM json_array_elements(public.get_instructor_work_sessions(p_from, p_to, base.instructor_id)) elem
        WHERE (elem->>'pay_amount') IS NULL
      ) AS missing_rates
    FROM (
      SELECT
        (elem->>'instructor_id')::uuid AS instructor_id,
        elem->>'instructor_name' AS instructor_name,
        (elem->>'duration_minutes')::int AS duration_minutes
      FROM json_array_elements(public.get_instructor_work_sessions(p_from, p_to, v_target)) elem
    ) base
    GROUP BY base.instructor_id, base.instructor_name
  ) inst;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.get_instructor_payroll_summary(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_payroll_summary(date, date, uuid) TO authenticated;

-- ── pay rate management ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_instructor_pay_rates(p_instructor_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() AND auth.uid() <> p_instructor_id THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(r) ORDER BY r.template_code)
      FROM instructor_pay_rates r
      WHERE r.instructor_id = p_instructor_id
    ),
    '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_instructor_pay_rates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_instructor_pay_rates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_instructor_pay_rate(
  p_instructor_id uuid,
  p_template_code text,
  p_rate_per_hour numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row instructor_pay_rates%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO instructor_pay_rates (instructor_id, template_code, rate_per_hour, updated_at)
  VALUES (p_instructor_id, p_template_code, p_rate_per_hour, now())
  ON CONFLICT (instructor_id, template_code)
  DO UPDATE SET
    rate_per_hour = EXCLUDED.rate_per_hour,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_instructor_pay_rate(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_instructor_pay_rate(uuid, text, numeric) TO authenticated;


-- ── supabase_migration_session_revenue.sql ──

-- Session-based revenue recognition: allocate package payments per scheduled session.

-- ── Core: one row per billable session ───────────────────────
CREATE OR REPLACE FUNCTION public.get_session_revenue_lines(
  p_from date,
  p_to date,
  p_mode text DEFAULT 'all'
)
RETURNS TABLE (
  session_date date,
  participant_id uuid,
  participant_name text,
  enrollment_id uuid,
  session_id uuid,
  lesson_id uuid,
  domain text,
  product_label text,
  per_session_amount numeric,
  revenue_amount numeric,
  recognition text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mode_filter AS (
    SELECT CASE
      WHEN p_mode IN ('realized', 'forecast', 'all') THEN p_mode
      ELSE 'all'
    END AS mode
  ),
  group_summer AS (
    SELECT
      ss.session_date,
      sa.participant_id,
      p.full_name AS participant_name,
      sa.enrollment_id,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      'summer'::text AS domain,
      pr.name AS product_label,
      ROUND(br.amount / NULLIF(cnt.total_sessions, 0), 2) AS per_session_amount,
      CASE
        WHEN ss.session_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN participants p ON p.id = sa.participant_id
    JOIN billing_records br ON br.enrollment_id = e.id
      AND br.billing_type = 'swim_course'
      AND br.payment_status = 'paid'
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS total_sessions
      FROM session_attendees sa2
      JOIN scheduled_sessions ss2 ON ss2.id = sa2.session_id
      WHERE sa2.enrollment_id = e.id
        AND ss2.status <> 'cancelled'
    ) cnt ON cnt.total_sessions > 0
    WHERE pt.code = 'summer_course'
      AND ss.status <> 'cancelled'
      AND ss.session_date BETWEEN p_from AND p_to
  ),
  group_annual AS (
    SELECT
      ss.session_date,
      sa.participant_id,
      p.full_name AS participant_name,
      sa.enrollment_id,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      'annual'::text AS domain,
      pr.name AS product_label,
      ROUND(
        br.amount / NULLIF(
          CASE
            WHEN br.billing_month IS NOT NULL THEN cnt.month_sessions
            ELSE cnt_all.total_sessions
          END,
          0
        ),
        2
      ) AS per_session_amount,
      CASE
        WHEN ss.session_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN participants p ON p.id = sa.participant_id
    JOIN billing_records br ON br.enrollment_id = e.id
      AND br.billing_type = 'annual_monthly'
      AND br.payment_status = 'paid'
      AND (
        (br.billing_month IS NOT NULL AND br.billing_month = date_trunc('month', ss.session_date)::date)
        OR (
          br.billing_month IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM billing_records brm
            WHERE brm.enrollment_id = e.id
              AND brm.payment_status = 'paid'
              AND brm.billing_month IS NOT NULL
          )
        )
      )
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS month_sessions
      FROM session_attendees sa2
      JOIN scheduled_sessions ss2 ON ss2.id = sa2.session_id
      WHERE sa2.enrollment_id = e.id
        AND ss2.status <> 'cancelled'
        AND date_trunc('month', ss2.session_date) = date_trunc('month', ss.session_date)
    ) cnt ON TRUE
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS total_sessions
      FROM session_attendees sa3
      JOIN scheduled_sessions ss3 ON ss3.id = sa3.session_id
      WHERE sa3.enrollment_id = e.id
        AND ss3.status <> 'cancelled'
    ) cnt_all ON TRUE
    WHERE pt.code IN ('annual_section', 'adult_style_improvement')
      AND ss.status <> 'cancelled'
      AND ss.session_date BETWEEN p_from AND p_to
      AND (
        br.billing_month IS NOT NULL
        OR cnt_all.total_sessions > 0
      )
  ),
  group_summer_legacy AS (
    SELECT
      ss.session_date,
      sa.participant_id,
      p.full_name AS participant_name,
      sa.enrollment_id,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      'summer'::text AS domain,
      pr.name AS product_label,
      ROUND(COALESCE(prod.price, 0) / NULLIF(cnt.total_sessions, 0), 2) AS per_session_amount,
      CASE
        WHEN ss.session_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
    JOIN products prod ON prod.id = e.product_id
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN participants p ON p.id = sa.participant_id
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS total_sessions
      FROM session_attendees sa2
      JOIN scheduled_sessions ss2 ON ss2.id = sa2.session_id
      WHERE sa2.enrollment_id = e.id
        AND ss2.status <> 'cancelled'
    ) cnt ON cnt.total_sessions > 0
    WHERE pt.code = 'summer_course'
      AND e.payment_status = 'paid'
      AND ss.status <> 'cancelled'
      AND ss.session_date BETWEEN p_from AND p_to
      AND NOT EXISTS (
        SELECT 1 FROM billing_records br
        WHERE br.enrollment_id = e.id
          AND br.payment_status = 'paid'
      )
  ),
  group_annual_legacy AS (
    SELECT
      ss.session_date,
      sa.participant_id,
      p.full_name AS participant_name,
      sa.enrollment_id,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      'annual'::text AS domain,
      pr.name AS product_label,
      ROUND(COALESCE(prod.price, 0) / NULLIF(cnt.month_sessions, 0), 2) AS per_session_amount,
      CASE
        WHEN ss.session_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
    JOIN products prod ON prod.id = e.product_id
    JOIN products pr ON pr.id = e.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN participants p ON p.id = sa.participant_id
    JOIN LATERAL (
      SELECT COUNT(*)::numeric AS month_sessions
      FROM session_attendees sa2
      JOIN scheduled_sessions ss2 ON ss2.id = sa2.session_id
      WHERE sa2.enrollment_id = e.id
        AND ss2.status <> 'cancelled'
        AND date_trunc('month', ss2.session_date) = date_trunc('month', ss.session_date)
    ) cnt ON cnt.month_sessions > 0
    WHERE pt.code IN ('annual_section', 'adult_style_improvement')
      AND e.payment_status = 'paid'
      AND ss.status <> 'cancelled'
      AND ss.session_date BETWEEN p_from AND p_to
      AND date_trunc('month', e.valid_from) = date_trunc('month', ss.session_date)
      AND NOT EXISTS (
        SELECT 1 FROM billing_records br
        WHERE br.enrollment_id = e.id
          AND br.payment_status = 'paid'
          AND br.billing_month = date_trunc('month', ss.session_date)::date
      )
  ),
  private_package AS (
    SELECT
      l.lesson_date AS session_date,
      COALESCE(pkg.participant_id, br.participant_id) AS participant_id,
      COALESCE(ptp.full_name, l.child_name) AS participant_name,
      NULL::uuid AS enrollment_id,
      NULL::uuid AS session_id,
      l.id AS lesson_id,
      'private'::text AS domain,
      CASE pkg.package_code
        WHEN 'private_5pack' THEN 'חבילת 5'
        WHEN 'private_10pack' THEN 'חבילת 10'
        ELSE pkg.package_code
      END AS product_label,
      ROUND(pkg.amount_paid / NULLIF(pkg.sessions_total, 0), 2) AS per_session_amount,
      CASE
        WHEN l.lesson_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM lessons l
    JOIN private_lesson_packages pkg ON pkg.id = l.private_package_id
    JOIN billing_records br ON br.private_package_id = pkg.id
      AND br.payment_status = 'paid'
    LEFT JOIN participants ptp ON ptp.id = pkg.participant_id
    WHERE NOT l.cancelled
      AND pkg.sessions_total > 0
      AND l.lesson_date BETWEEN p_from AND p_to
  ),
  private_single AS (
    SELECT
      l.lesson_date AS session_date,
      COALESCE(br.participant_id, (
        SELECT p2.id
        FROM participants p2
        JOIN families f ON f.id = p2.family_id
        WHERE f.phone = l.parent_phone
        ORDER BY p2.created_at
        LIMIT 1
      )) AS participant_id,
      l.child_name AS participant_name,
      NULL::uuid AS enrollment_id,
      NULL::uuid AS session_id,
      l.id AS lesson_id,
      'private'::text AS domain,
      CASE COALESCE(l.lesson_format, 'single')
        WHEN 'double' THEN 'שיעור זוגי'
        ELSE 'שיעור פרטי'
      END AS product_label,
      ROUND(COALESCE(br.amount, l.price, 0), 2) AS per_session_amount,
      CASE
        WHEN l.lesson_date <= CURRENT_DATE THEN 'realized'
        ELSE 'forecast'
      END AS recognition
    FROM lessons l
    LEFT JOIN billing_records br ON br.lesson_id = l.id
      AND br.payment_status = 'paid'
    WHERE NOT l.cancelled
      AND l.private_package_id IS NULL
      AND l.lesson_date BETWEEN p_from AND p_to
      AND (
        br.id IS NOT NULL
        OR (l.payment_status = 'paid' AND COALESCE(l.price, 0) > 0)
      )
  ),
  combined AS (
    SELECT * FROM group_summer
    UNION ALL SELECT * FROM group_annual
    UNION ALL SELECT * FROM group_summer_legacy
    UNION ALL SELECT * FROM group_annual_legacy
    UNION ALL SELECT * FROM private_package
    UNION ALL SELECT * FROM private_single
  )
  SELECT
    c.session_date,
    c.participant_id,
    c.participant_name,
    c.enrollment_id,
    c.session_id,
    c.lesson_id,
    c.domain,
    c.product_label,
    c.per_session_amount,
    c.per_session_amount AS revenue_amount,
    c.recognition
  FROM combined c
  CROSS JOIN mode_filter mf
  WHERE c.per_session_amount > 0
    AND (
      mf.mode = 'all'
      OR (mf.mode = 'realized' AND c.recognition = 'realized')
      OR (mf.mode = 'forecast' AND c.recognition = 'forecast')
    );
$$;

-- ── Finance breakdown (session dates) ────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_breakdown(
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_domain json;
  v_monthly json;
  v_total numeric;
  v_paying integer;
  v_avg numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.domain), '[]'::json)
  INTO v_by_domain
  FROM (
    SELECT
      domain,
      COUNT(*)::int AS paid_count,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'all')
    GROUP BY domain
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month_start), '[]'::json)
  INTO v_monthly
  FROM (
    SELECT
      date_trunc('month', session_date)::date AS month_start,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'all')
    GROUP BY 1
  ) t;

  SELECT
    COUNT(DISTINCT participant_id)::int,
    COALESCE(SUM(revenue_amount), 0)::numeric(12,2)
  INTO v_paying, v_total
  FROM public.get_session_revenue_lines(p_from, p_to, 'all');

  v_avg := CASE WHEN v_paying > 0 THEN ROUND(v_total / v_paying, 2) ELSE 0 END;

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'by_domain', v_by_domain,
    'monthly', v_monthly,
    'total_revenue', v_total,
    'paying_customers', v_paying,
    'avg_revenue_per_customer', v_avg,
    'recognition_basis', 'session_date'
  );
END;
$$;

-- ── Revenue by season (session dates within season) ─────────
CREATE OR REPLACE FUNCTION public.get_revenue_by_season(p_season_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.season_name)
    FROM (
      SELECT
        s.id AS season_id,
        s.name AS season_name,
        (
          SELECT COUNT(*)::int
          FROM public.get_session_revenue_lines(
            s.start_date,
            (s.end_date - 1),
            'all'
          ) rl
          LEFT JOIN enrollments e ON e.id = rl.enrollment_id
          LEFT JOIN products pr ON pr.id = e.product_id
          WHERE pr.season_id = s.id
             OR (
               rl.lesson_id IS NOT NULL
               AND rl.session_date >= s.start_date
               AND rl.session_date < s.end_date
             )
        ) AS paid_count,
        (
          SELECT COUNT(*)::int
          FROM enrollments e
          JOIN products p ON p.id = e.product_id
          WHERE p.season_id = s.id AND e.payment_status = 'unpaid' AND e.active
        ) AS unpaid_count,
        (
          SELECT COUNT(*)::int
          FROM enrollments e
          JOIN products p ON p.id = e.product_id
          WHERE p.season_id = s.id AND e.payment_status = 'waived' AND e.active
        ) AS waived_count,
        (
          SELECT COALESCE(SUM(rl.revenue_amount), 0)::numeric(12,2)
          FROM public.get_session_revenue_lines(
            s.start_date,
            (s.end_date - 1),
            'all'
          ) rl
          LEFT JOIN enrollments e ON e.id = rl.enrollment_id
          LEFT JOIN products pr ON pr.id = e.product_id
          WHERE pr.season_id = s.id
             OR (
               rl.lesson_id IS NOT NULL
               AND rl.session_date >= s.start_date
               AND rl.session_date < s.end_date
             )
        ) AS gross_revenue
      FROM seasons s
      WHERE p_season_id IS NULL OR s.id = p_season_id
    ) t
  ), '[]'::json);
END;
$$;

-- ── Future revenue forecast ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_forecast(
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_sessions integer;
  v_participants integer;
  v_realized numeric;
  v_by_domain json;
  v_by_period json;
  v_by_participant json;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT
    COALESCE(SUM(revenue_amount), 0),
    COUNT(*)::int,
    COUNT(DISTINCT participant_id)::int
  INTO v_total, v_sessions, v_participants
  FROM public.get_session_revenue_lines(p_from, p_to, 'forecast');

  SELECT COALESCE(SUM(revenue_amount), 0)
  INTO v_realized
  FROM public.get_session_revenue_lines(p_from, p_to, 'realized');

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.domain), '[]'::json)
  INTO v_by_domain
  FROM (
    SELECT domain, COUNT(*)::int AS session_count,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'forecast')
    GROUP BY domain
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.period_start), '[]'::json)
  INTO v_by_period
  FROM (
    SELECT date_trunc('week', session_date)::date AS period_start,
      COUNT(*)::int AS session_count,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'forecast')
    GROUP BY 1
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.revenue DESC), '[]'::json)
  INTO v_by_participant
  FROM (
    SELECT participant_id, participant_name, product_label,
      COUNT(*)::int AS session_count,
      COALESCE(SUM(revenue_amount), 0)::numeric(12,2) AS revenue
    FROM public.get_session_revenue_lines(p_from, p_to, 'forecast')
    GROUP BY participant_id, participant_name, product_label
    LIMIT 100
  ) t;

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'forecast_revenue', v_total,
    'forecast_sessions', v_sessions,
    'forecast_participants', v_participants,
    'realized_in_range', v_realized,
    'by_domain', v_by_domain,
    'by_period', v_by_period,
    'by_participant', v_by_participant
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_revenue_lines(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_revenue_lines(date, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_by_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_season(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_forecast(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_forecast(date, date) TO authenticated;


-- ── supabase_migration_session_instructor_overrides.sql ──

-- ============================================================
--  MIGRATION: החלפת מדריך חד-פעמית לקבוצות
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- ── 1. טבלת override ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_instructor_overrides (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_session_id   UUID NOT NULL UNIQUE REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
  instructor_id          UUID NOT NULL REFERENCES profiles(id),
  instructor_name        TEXT NOT NULL,
  original_instructor_id UUID REFERENCES profiles(id),
  reason                 TEXT,
  created_by             UUID REFERENCES profiles(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_instructor_overrides_session
  ON session_instructor_overrides (scheduled_session_id);

CREATE INDEX IF NOT EXISTS idx_session_instructor_overrides_instructor
  ON session_instructor_overrides (instructor_id);

ALTER TABLE session_instructor_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approved read session instructor overrides" ON session_instructor_overrides;
CREATE POLICY "approved read session instructor overrides"
  ON session_instructor_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS "admins manage session instructor overrides" ON session_instructor_overrides;
CREATE POLICY "admins manage session instructor overrides"
  ON session_instructor_overrides FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 2. helper — מדריך אפקטיבי למפגש ─────────────────────
CREATE OR REPLACE FUNCTION public.effective_session_instructor(p_session_id uuid)
RETURNS TABLE (
  instructor_id uuid,
  instructor_name text,
  is_substitute boolean,
  original_instructor_id uuid,
  original_instructor_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(o.instructor_id, pr.instructor_id) AS instructor_id,
    COALESCE(o.instructor_name, pr.instructor_name) AS instructor_name,
    (o.id IS NOT NULL) AS is_substitute,
    COALESCE(o.original_instructor_id, pr.instructor_id) AS original_instructor_id,
    COALESCE(op.full_name, pr.instructor_name) AS original_instructor_name
  FROM scheduled_sessions ss
  JOIN products pr ON pr.id = ss.product_id
  LEFT JOIN session_instructor_overrides o ON o.scheduled_session_id = ss.id
  LEFT JOIN profiles op ON op.id = COALESCE(o.original_instructor_id, pr.instructor_id)
  WHERE ss.id = p_session_id;
$$;

REVOKE ALL ON FUNCTION public.effective_session_instructor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_session_instructor(uuid) TO authenticated;

-- ── 3. RPC — הגדרה / ביטול החלפה ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_session_instructor_override(
  p_session_id uuid,
  p_substitute_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_substitute record;
  v_effective record;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT
    ss.id,
    ss.status,
    ss.session_date,
    pr.instructor_id AS original_instructor_id,
    pr.instructor_name AS original_instructor_name,
    pt.code AS template_code
  INTO v_session
  FROM scheduled_sessions ss
  JOIN products pr ON pr.id = ss.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE ss.id = p_session_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_session.status = 'cancelled' THEN
    RETURN json_build_object('result', 'cancelled');
  END IF;

  IF v_session.template_code = 'swim_assessment' THEN
    RETURN json_build_object('result', 'assessment_not_allowed');
  END IF;

  IF p_substitute_id IS NULL THEN
    DELETE FROM session_instructor_overrides
    WHERE scheduled_session_id = p_session_id;

    SELECT * INTO v_effective
    FROM public.effective_session_instructor(p_session_id);

    RETURN json_build_object(
      'result', 'cleared',
      'instructor_id', v_effective.instructor_id,
      'instructor_name', v_effective.instructor_name,
      'is_substitute', FALSE,
      'original_instructor_id', v_effective.original_instructor_id,
      'original_instructor_name', v_effective.original_instructor_name
    );
  END IF;

  IF p_substitute_id = v_session.original_instructor_id THEN
    DELETE FROM session_instructor_overrides
    WHERE scheduled_session_id = p_session_id;

    RETURN json_build_object(
      'result', 'cleared',
      'instructor_id', v_session.original_instructor_id,
      'instructor_name', v_session.original_instructor_name,
      'is_substitute', FALSE,
      'original_instructor_id', v_session.original_instructor_id,
      'original_instructor_name', v_session.original_instructor_name
    );
  END IF;

  SELECT id, full_name
  INTO v_substitute
  FROM profiles
  WHERE id = p_substitute_id
    AND role = 'instructor'
    AND status = 'approved';

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'invalid_substitute');
  END IF;

  INSERT INTO session_instructor_overrides (
    scheduled_session_id,
    instructor_id,
    instructor_name,
    original_instructor_id,
    reason,
    created_by
  ) VALUES (
    p_session_id,
    v_substitute.id,
    v_substitute.full_name,
    v_session.original_instructor_id,
    NULLIF(trim(p_reason), ''),
    auth.uid()
  )
  ON CONFLICT (scheduled_session_id) DO UPDATE SET
    instructor_id = EXCLUDED.instructor_id,
    instructor_name = EXCLUDED.instructor_name,
    original_instructor_id = EXCLUDED.original_instructor_id,
    reason = EXCLUDED.reason,
    created_by = EXCLUDED.created_by,
    created_at = NOW();

  SELECT * INTO v_effective
  FROM public.effective_session_instructor(p_session_id);

  RETURN json_build_object(
    'result', 'ok',
    'instructor_id', v_effective.instructor_id,
    'instructor_name', v_effective.instructor_name,
    'is_substitute', v_effective.is_substitute,
    'original_instructor_id', v_effective.original_instructor_id,
    'original_instructor_name', v_effective.original_instructor_name,
    'reason', NULLIF(trim(p_reason), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_session_instructor_override(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_session_instructor_override(uuid, uuid, text) TO authenticated;

-- ── 4. עדכון can_mark_session_attendance ───────────────────
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

  SELECT
    pt.code,
    eff.instructor_id,
    ss.session_date
  INTO v_template, v_instructor_id, v_session_date
  FROM scheduled_sessions ss
  JOIN products pr ON pr.id = ss.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
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

-- ── 5. עדכון list_instructor_sessions ──────────────────────
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
    CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
    LEFT JOIN session_attendees sa ON sa.session_id = ss.id
    WHERE ss.session_date = p_date
      AND ss.status <> 'cancelled'
      AND (
        public.is_admin()
        OR (pt.code = 'swim_assessment' AND p_date = CURRENT_DATE)
        OR eff.instructor_id = v_uid
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

-- ── 6. עדכון get_instructor_work_sessions (שכר למחליף) ───
CREATE OR REPLACE FUNCTION public.get_instructor_work_sessions(
  p_from date,
  p_to date,
  p_instructor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF public.is_admin() THEN
    v_target := p_instructor_id;
  ELSE
    v_target := v_uid;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.session_date, t.start_time, t.title), '[]'::json)
  INTO v_rows
  FROM (
  SELECT
    w.instructor_id,
    p.full_name AS instructor_name,
    w.session_type,
    w.session_id,
    w.lesson_id,
    w.scheduled_session_id,
    w.session_date,
    w.start_time,
    w.title,
    w.template_code,
    w.duration_minutes,
    ROUND(w.duration_minutes / 60.0, 2) AS duration_hours,
    w.marked_at,
    ipr.rate_per_hour AS pay_rate,
    CASE
      WHEN ipr.rate_per_hour IS NOT NULL
      THEN ROUND((w.duration_minutes / 60.0) * ipr.rate_per_hour, 2)
      ELSE NULL
    END AS pay_amount
  FROM (
    SELECT
      eff.instructor_id,
      'group'::text AS session_type,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      ss.id AS scheduled_session_id,
      ss.session_date,
      ss.start_time,
      pr.name AS title,
      pt.code AS template_code,
      public.resolve_session_duration_minutes(pt.code, ss.start_time, ss.end_time) AS duration_minutes,
      MAX(sa.attendance_marked_at) AS marked_at
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
    JOIN session_attendees sa ON sa.session_id = ss.id
    WHERE ss.status <> 'cancelled'
      AND pt.code <> 'swim_assessment'
      AND eff.instructor_id IS NOT NULL
      AND sa.attendance_status IN ('present', 'absent', 'excused', 'late')
      AND ss.session_date BETWEEN p_from AND p_to
    GROUP BY ss.id, eff.instructor_id, pr.name, pt.code, ss.session_date, ss.start_time, ss.end_time

    UNION ALL

    SELECT
      l.instructor_id,
      'private'::text AS session_type,
      l.id AS session_id,
      l.id AS lesson_id,
      NULL::uuid AS scheduled_session_id,
      l.lesson_date AS session_date,
      l.start_time,
      l.child_name AS title,
      'private_lesson'::text AS template_code,
      public.resolve_session_duration_minutes('private_lesson', l.start_time, l.end_time) AS duration_minutes,
      l.attendance_marked_at AS marked_at
    FROM lessons l
    WHERE NOT l.cancelled
      AND l.instructor_id IS NOT NULL
      AND l.attendance_status IN ('present', 'absent', 'excused', 'late')
      AND l.lesson_date BETWEEN p_from AND p_to

    UNION ALL

    SELECT
      marker.instructor_id,
      'group'::text AS session_type,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      ss.id AS scheduled_session_id,
      ss.session_date,
      ss.start_time,
      COALESCE(pr.name, 'מבדק') AS title,
      'swim_assessment'::text AS template_code,
      public.resolve_session_duration_minutes('swim_assessment', ss.start_time, ss.end_time) AS duration_minutes,
      marker.marked_at
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN LATERAL (
      SELECT
        sa.attendance_marked_by AS instructor_id,
        MAX(sa.attendance_marked_at) AS marked_at
      FROM session_attendees sa
      WHERE sa.session_id = ss.id
        AND sa.attendance_status IN ('present', 'absent', 'excused', 'late')
        AND sa.attendance_marked_by IS NOT NULL
      GROUP BY sa.attendance_marked_by
      ORDER BY COUNT(*) DESC, MAX(sa.attendance_marked_at) DESC
      LIMIT 1
    ) marker ON true
    WHERE ss.status <> 'cancelled'
      AND pt.code = 'swim_assessment'
      AND ss.session_date BETWEEN p_from AND p_to
  ) w
  JOIN profiles p ON p.id = w.instructor_id
  LEFT JOIN instructor_pay_rates ipr
    ON ipr.instructor_id = w.instructor_id
   AND ipr.template_code = w.template_code
  WHERE v_target IS NULL OR w.instructor_id = v_target
  ) t;

  RETURN v_rows;
END;
$$;

-- ── 7. RLS session_attendees — מחליף יכול לסמן נוכחות ────
DROP POLICY IF EXISTS "instructor update session attendees attendance" ON session_attendees;
CREATE POLICY "instructor update session attendees attendance"
  ON session_attendees FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM scheduled_sessions ss
      JOIN products pr ON pr.id = ss.product_id
      JOIN product_templates pt ON pt.id = pr.template_id
      CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
      WHERE ss.id = session_attendees.session_id
        AND (
          eff.instructor_id = auth.uid()
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
      CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
      WHERE ss.id = session_attendees.session_id
        AND (
          eff.instructor_id = auth.uid()
          OR (pt.code = 'swim_assessment' AND ss.session_date = CURRENT_DATE)
        )
    )
  );

SELECT 'session instructor overrides migration complete ✓' AS status;


-- ── supabase_migration_analytics_v2.sql ──

-- ============================================================
--  Stream Line OS — Analytics v2
--  דוחות מנהל: מדריך, סריקה מול נוכחות, הכנסות, משפך מבדקים
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT NULL;

-- ── attendance by instructor ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_attendance_by_instructor(
  p_from date,
  p_to date,
  p_product_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.instructor_name)
      FROM (
        SELECT
          COALESCE(pr.instructor_name, l.instructor_name, '—') AS instructor_name,
          COUNT(*) FILTER (WHERE ae.status = 'present') AS present_count,
          COUNT(*) FILTER (WHERE ae.status = 'absent') AS absent_count,
          COUNT(*) AS total_marks,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0),
            1
          ) AS attendance_rate
        FROM attendance_events ae
        LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        LEFT JOIN lessons l ON l.id = ae.lesson_id
        LEFT JOIN products pr ON pr.id = ss.product_id
        WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to
          AND (p_product_id IS NULL OR pr.id = p_product_id)
        GROUP BY 1
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── scan vs attendance ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_scan_vs_attendance(
  p_from date,
  p_to date,
  p_product_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.week_start)
      FROM (
        SELECT
          date_trunc('week', ss.session_date)::date AS week_start,
          COUNT(DISTINCT sa.id) AS expected,
          COUNT(*) FILTER (
            WHERE ae.source = 'guard_scan' AND ae.status = 'present'
          ) AS scanned,
          COUNT(*) FILTER (
            WHERE ae.source = 'instructor' AND ae.status = 'present'
          ) AS instructor_marked,
          COUNT(*) FILTER (WHERE ae.status = 'present') AS total_present,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE ae.source = 'guard_scan' AND ae.status = 'present')
              / NULLIF(COUNT(DISTINCT sa.id), 0),
            1
          ) AS scan_rate_pct,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE ae.status = 'present')
              / NULLIF(COUNT(DISTINCT sa.id), 0),
            1
          ) AS attendance_rate_pct
        FROM scheduled_sessions ss
        JOIN session_attendees sa ON sa.session_id = ss.id
        JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
        LEFT JOIN attendance_events ae
          ON ae.scheduled_session_id = ss.id
          AND ae.enrollment_id = sa.enrollment_id
        JOIN products pr ON pr.id = ss.product_id
        WHERE ss.session_date BETWEEN p_from AND p_to
          AND ss.status <> 'cancelled'
          AND (p_product_id IS NULL OR pr.id = p_product_id)
        GROUP BY 1
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── revenue by season ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_by_season(p_season_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.season_start DESC)
      FROM (
        SELECT
          s.id AS season_id,
          s.name AS season_name,
          s.start_date AS season_start,
          COUNT(*) FILTER (WHERE e.payment_status = 'paid')::int AS paid_count,
          COUNT(*) FILTER (WHERE e.payment_status = 'unpaid')::int AS unpaid_count,
          COUNT(*) FILTER (WHERE e.payment_status = 'waived')::int AS waived_count,
          COALESCE(SUM(
            CASE WHEN e.payment_status = 'paid' THEN COALESCE(p.price, 0) ELSE 0 END
          ), 0)::numeric(12,2) AS gross_revenue,
          COALESCE(SUM(COALESCE(p.price, 0)), 0)::numeric(12,2) AS potential_revenue
        FROM seasons s
        JOIN products p ON p.season_id = s.id
        JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
        WHERE p_season_id IS NULL OR s.id = p_season_id
        GROUP BY s.id, s.name, s.start_date
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── assessment conversion funnel ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_assessment_conversion_funnel(
  p_from date,
  p_to date
)
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
  v_class integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*) INTO v_registered
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.status <> 'abandoned';

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
  FROM summer_invitations si
  JOIN assessment_leads al ON al.id = si.assessment_lead_id
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND si.used_at IS NOT NULL;

  SELECT COUNT(*) INTO v_class
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.status = 'registered_class';

  RETURN json_build_object(
    'registered', v_registered,
    'passed', v_passed,
    'failed', v_failed,
    'summer_enrolled', v_summer,
    'class_enrolled', v_class,
    'pass_rate', CASE WHEN v_registered > 0
      THEN ROUND(100.0 * v_passed / v_registered, 1) ELSE 0 END,
    'summer_conversion', CASE WHEN v_passed > 0
      THEN ROUND(100.0 * v_summer / v_passed, 1) ELSE 0 END,
    'class_conversion', CASE WHEN v_passed > 0
      THEN ROUND(100.0 * v_class / v_passed, 1) ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_attendance_by_instructor(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_by_instructor(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_scan_vs_attendance(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scan_vs_attendance(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_by_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_season(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_assessment_conversion_funnel(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assessment_conversion_funnel(date, date) TO authenticated;

SELECT 'Analytics v2 migration complete' AS status;


-- ── supabase_migration_command_center_foundation.sql ──

-- ============================================================
--  Command Center — Foundation (שלב 1)
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- ── 1. participants ─────────────────────────────────────────
-- נרמול מגדר מייבוא ישן (ז'/נ' = זכר/נקבה) לפני CHECK
UPDATE participants SET gender = 'male' WHERE gender IN ('ז''', 'זכר', 'ז', 'm', 'M');
UPDATE participants SET gender = 'female' WHERE gender IN ('נ''', 'נקבה', 'נ', 'f', 'F');

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS first_enrolled_at DATE;

ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_grade_check;
ALTER TABLE participants ADD CONSTRAINT participants_grade_check
  CHECK (grade IS NULL OR grade IN (
    'גן', 'א''', 'ב''', 'ג''', 'ד''', 'ה''', 'ו''', 'ז''', 'ח''', 'ט''', 'י''-י"ב'
  ));

ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_gender_check;
ALTER TABLE participants ADD CONSTRAINT participants_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female'));

UPDATE participants p
SET first_enrolled_at = sub.min_date
FROM (
  SELECT participant_id, MIN(valid_from) AS min_date
  FROM enrollments
  GROUP BY participant_id
) sub
WHERE p.id = sub.participant_id
  AND p.first_enrolled_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_participant_first_enrolled_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE participants
  SET first_enrolled_at = LEAST(
    COALESCE(first_enrolled_at, NEW.valid_from),
    NEW.valid_from
  )
  WHERE id = NEW.participant_id
    AND first_enrolled_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enrollments_set_first_enrolled_at ON enrollments;
CREATE TRIGGER enrollments_set_first_enrolled_at
  AFTER INSERT ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_participant_first_enrolled_at();

-- ── 2. enrollments ──────────────────────────────────────────
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE enrollments
SET cancelled_at = created_at
WHERE active = FALSE AND cancelled_at IS NULL;

-- ── 3. profiles (instructor hire date) ────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hired_at DATE;

UPDATE profiles
SET hired_at = created_at::date
WHERE hired_at IS NULL
  AND role = 'instructor'
  AND status = 'approved';

-- ── 4. private lessons — price & payment ──────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS payment_status TEXT;

UPDATE lessons SET payment_status = 'unpaid' WHERE payment_status IS NULL;

ALTER TABLE lessons ALTER COLUMN payment_status SET DEFAULT 'unpaid';
ALTER TABLE lessons ALTER COLUMN payment_status SET NOT NULL;

ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_payment_status_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid', 'waived'));

-- ── 5. lead sources ───────────────────────────────────────────
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
  IF v_source IN ('recommendation', 'facebook', 'instagram', 'website', 'signage', 'import') THEN
    RETURN v_source;
  END IF;
  IF v_source IN ('web', 'אתר', 'אתר אינטרנט') THEN RETURN 'website'; END IF;
  IF v_source IN ('פייסבוק', 'fb') THEN RETURN 'facebook'; END IF;
  IF v_source IN ('אינסטגרם', 'ig', 'instagram') THEN RETURN 'instagram'; END IF;
  IF v_source IN ('מפה לאוזן', 'המלצה', 'פה לאוזן', 'word of mouth') THEN RETURN 'recommendation'; END IF;
  IF v_source IN ('שילוט', 'signage') THEN RETURN 'signage'; END IF;
  RETURN 'website';
END;
$$;

ALTER TABLE assessment_leads DROP CONSTRAINT IF EXISTS assessment_leads_source_check;
ALTER TABLE assessment_leads ADD CONSTRAINT assessment_leads_source_check
  CHECK (source IN ('facebook', 'instagram', 'recommendation', 'website', 'signage', 'import'));

-- ── 6. school_health_settings ─────────────────────────────────
CREATE TABLE IF NOT EXISTS school_health_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occupancy_weight      NUMERIC(5,2) NOT NULL DEFAULT 60
    CHECK (occupancy_weight >= 0 AND occupancy_weight <= 100),
  growth_ratio_weight   NUMERIC(5,2) NOT NULL DEFAULT 40
    CHECK (growth_ratio_weight >= 0 AND growth_ratio_weight <= 100),
  green_min             NUMERIC(5,2) NOT NULL DEFAULT 80
    CHECK (green_min >= 0 AND green_min <= 100),
  yellow_min            NUMERIC(5,2) NOT NULL DEFAULT 60
    CHECK (yellow_min >= 0 AND yellow_min <= 100),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_by            UUID REFERENCES profiles(id)
);

INSERT INTO school_health_settings (occupancy_weight, growth_ratio_weight, green_min, yellow_min)
SELECT 60, 40, 80, 60
WHERE NOT EXISTS (SELECT 1 FROM school_health_settings LIMIT 1);

ALTER TABLE school_health_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read school health settings" ON school_health_settings;
CREATE POLICY "admin read school health settings"
  ON school_health_settings FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin update school health settings" ON school_health_settings;
CREATE POLICY "admin update school health settings"
  ON school_health_settings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 7. operational_alerts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS operational_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type       TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'critical')),
  entity_type      TEXT,
  entity_id        UUID,
  title            TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  acknowledged_at  TIMESTAMPTZ,
  acknowledged_by  UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_alerts_open_idx
  ON operational_alerts (created_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE operational_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read operational alerts" ON operational_alerts;
CREATE POLICY "staff read operational alerts"
  ON operational_alerts FOR SELECT
  USING (public.is_admin_or_office());

DROP POLICY IF EXISTS "staff manage operational alerts" ON operational_alerts;
CREATE POLICY "staff manage operational alerts"
  ON operational_alerts FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ── 8. cancel_enrollment — set cancelled_at ───────────────────
CREATE OR REPLACE FUNCTION public.cancel_enrollment(p_enrollment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment record;
  v_lead record;
  v_product_id uuid;
  v_slot_id uuid;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_enrollment
  FROM enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_enrollment.active THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  v_product_id := v_enrollment.product_id;

  UPDATE enrollments
  SET active = FALSE, cancelled_at = NOW()
  WHERE id = p_enrollment_id;

  UPDATE access_passes
  SET status = 'cancelled'
  WHERE enrollment_id = p_enrollment_id AND status = 'active';

  SELECT al.slot_id INTO v_slot_id
  FROM assessment_leads al
  WHERE al.enrollment_id = p_enrollment_id
  LIMIT 1;

  IF v_slot_id IS NOT NULL THEN
    UPDATE assessment_slots
    SET enrolled_count = GREATEST(enrolled_count - 1, 0)
    WHERE id = v_slot_id;
    PERFORM public.try_promote_waitlist('assessment_slot', v_slot_id);
  ELSE
    PERFORM public.try_promote_waitlist('product', v_product_id);
  END IF;

  RETURN json_build_object('result', 'ok');
END;
$$;

-- ── 9. register_assessment — gender, grade, birth_date ────────
DROP FUNCTION IF EXISTS public.register_assessment(uuid, text, integer, text, text);
DROP FUNCTION IF EXISTS public.register_assessment(uuid, text, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.register_assessment(
  p_slot_id uuid,
  p_child_name text,
  p_child_age integer,
  p_parent_name text,
  p_phone text,
  p_source text DEFAULT 'website',
  p_gender text DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_birth_date date DEFAULT NULL
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
  v_gender text;
  v_grade text;
BEGIN
  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));
  v_source := public.normalize_lead_source(p_source);
  v_gender := NULLIF(lower(trim(COALESCE(p_gender, ''))), '');
  v_grade := NULLIF(trim(COALESCE(p_grade, '')), '');

  IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female') THEN
    RETURN json_build_object('result', 'invalid_gender');
  END IF;

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

  v_birth_date := p_birth_date;
  IF v_birth_date IS NULL AND p_child_age IS NOT NULL AND p_child_age > 0 AND p_child_age < 120 THEN
    v_birth_date := (CURRENT_DATE - (p_child_age * interval '1 year'))::date;
  END IF;

  SELECT id INTO v_participant_id
  FROM participants
  WHERE family_id = v_family_id
    AND lower(trim(full_name)) = lower(v_child_name);

  IF v_participant_id IS NULL THEN
    INSERT INTO participants (family_id, full_name, birth_date, gender, grade)
    VALUES (v_family_id, v_child_name, v_birth_date, v_gender, v_grade)
    RETURNING id INTO v_participant_id;
  ELSE
    UPDATE participants SET
      birth_date = COALESCE(v_birth_date, birth_date),
      gender = COALESCE(v_gender, gender),
      grade = COALESCE(v_grade, grade)
    WHERE id = v_participant_id;
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

REVOKE ALL ON FUNCTION public.register_assessment(uuid, text, integer, text, text, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_assessment(uuid, text, integer, text, text, text, text, text, date) TO anon, authenticated;

-- ── 10. create_assessment_lead — gender, grade, birth_date ───
DROP FUNCTION IF EXISTS public.create_assessment_lead(text, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.create_assessment_lead(
  p_phone text,
  p_child_name text,
  p_parent_name text DEFAULT NULL,
  p_source text DEFAULT 'website',
  p_notes text DEFAULT NULL,
  p_child_age integer DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_birth_date date DEFAULT NULL
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
  v_gender text;
  v_grade text;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s', '', 'g');
  v_child_name := trim(COALESCE(p_child_name, ''));
  v_source := public.normalize_lead_source(p_source);
  v_gender := NULLIF(lower(trim(COALESCE(p_gender, ''))), '');
  v_grade := NULLIF(trim(COALESCE(p_grade, '')), '');

  IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female') THEN
    RETURN json_build_object('result', 'invalid_gender');
  END IF;

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

  v_birth_date := p_birth_date;
  IF v_birth_date IS NULL AND p_child_age IS NOT NULL AND p_child_age > 0 AND p_child_age < 120 THEN
    v_birth_date := (CURRENT_DATE - (p_child_age * interval '1 year'))::date;
  END IF;

  SELECT id INTO v_participant_id
  FROM participants
  WHERE family_id = v_family_id
    AND lower(trim(full_name)) = lower(v_child_name);

  IF v_participant_id IS NULL THEN
    INSERT INTO participants (family_id, full_name, birth_date, gender, grade)
    VALUES (v_family_id, v_child_name, v_birth_date, v_gender, v_grade)
    RETURNING id INTO v_participant_id;
  ELSE
    UPDATE participants SET
      birth_date = COALESCE(v_birth_date, birth_date),
      gender = COALESCE(v_gender, gender),
      grade = COALESCE(v_grade, grade)
    WHERE id = v_participant_id;
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

REVOKE ALL ON FUNCTION public.create_assessment_lead(text, text, text, text, text, integer, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_assessment_lead(text, text, text, text, text, integer, text, text, date) TO authenticated;

SELECT 'Command Center foundation migration complete' AS status;


-- ── supabase_migration_command_center_sheets.sql ──

-- ============================================================
--  Command Center — Sheets sync support (שלב 3)
-- ============================================================

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS gender_manual_at TIMESTAMPTZ;

SELECT 'gender_manual_at column ready' AS status;


-- ── supabase_migration_command_center_analytics.sql ──

-- ============================================================
--  Command Center — Analytics RPCs (שלב 2)
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- ── Helper: active student IDs (enrolled + present) ───────────
CREATE OR REPLACE FUNCTION public.cc_active_student_ids(
  p_as_of date DEFAULT CURRENT_DATE,
  p_season_id uuid DEFAULT NULL
)
RETURNS TABLE(participant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT e.participant_id
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  JOIN attendance_events ae ON ae.enrollment_id = e.id AND ae.status = 'present'
  WHERE e.active = TRUE
    AND e.valid_from <= p_as_of
    AND e.valid_until >= p_as_of
    AND (p_season_id IS NULL OR p.season_id = p_season_id);
$$;

-- ── 1. get_school_overview_kpis ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_school_overview_kpis(
  p_as_of date DEFAULT CURRENT_DATE,
  p_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid := p_season_id;
  v_active_students integer;
  v_active_groups integer;
  v_active_instructors integer;
  v_enrolled integer;
  v_capacity integer;
  v_occupancy numeric;
  v_new_month integer;
  v_churned_month integer;
  v_private_lessons integer;
  v_month_start date;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1;
  END IF;

  v_month_start := date_trunc('month', p_as_of)::date;

  SELECT COUNT(*)::int INTO v_active_students
  FROM public.cc_active_student_ids(p_as_of, v_season_id);

  SELECT COUNT(DISTINCT p.id)::int INTO v_active_groups
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  SELECT COUNT(DISTINCT COALESCE(p.instructor_id::text, p.instructor_name))::int
  INTO v_active_instructors
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  SELECT
    COUNT(*)::int,
    COALESCE(SUM(p.capacity), 0)::int
  INTO v_enrolled, v_capacity
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE p.capacity IS NOT NULL
    AND (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  v_occupancy := CASE WHEN v_capacity > 0
    THEN ROUND(100.0 * v_enrolled / v_capacity, 1) ELSE 0 END;

  SELECT COUNT(DISTINCT e.participant_id)::int INTO v_new_month
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  WHERE e.valid_from >= v_month_start
    AND e.valid_from <= p_as_of
    AND (v_season_id IS NULL OR p.season_id = v_season_id);

  SELECT COUNT(*)::int INTO v_churned_month
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  WHERE e.active = FALSE
    AND e.cancelled_at IS NOT NULL
    AND e.cancelled_at::date >= v_month_start
    AND e.cancelled_at::date <= p_as_of
    AND (v_season_id IS NULL OR p.season_id = v_season_id);

  SELECT COUNT(*)::int INTO v_private_lessons
  FROM lessons
  WHERE NOT cancelled
    AND lesson_date >= p_as_of;

  RETURN json_build_object(
    'as_of', p_as_of,
    'season_id', v_season_id,
    'active_students', v_active_students,
    'active_groups', v_active_groups,
    'active_instructors', v_active_instructors,
    'occupancy_pct', v_occupancy,
    'enrolled_seats', v_enrolled,
    'total_capacity', v_capacity,
    'new_this_month', v_new_month,
    'churned_this_month', v_churned_month,
    'active_private_lessons', v_private_lessons
  );
END;
$$;

-- ── 2. get_student_demographics ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_student_demographics(
  p_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid := p_season_id;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1;
  END IF;

  RETURN json_build_object(
    'season_id', v_season_id,
    'by_grade', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.cnt DESC)
      FROM (
        SELECT COALESCE(p.grade, 'לא ידוע') AS grade, COUNT(DISTINCT p.id)::int AS cnt
        FROM participants p
        WHERE EXISTS (
          SELECT 1 FROM enrollments e
          JOIN products pr ON pr.id = e.product_id
          WHERE e.participant_id = p.id AND e.active = TRUE
            AND (v_season_id IS NULL OR pr.season_id = v_season_id)
        )
        GROUP BY 1
      ) t
    ), '[]'::json),
    'by_gender', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.cnt DESC)
      FROM (
        SELECT COALESCE(p.gender, 'unknown') AS gender, COUNT(DISTINCT p.id)::int AS cnt
        FROM participants p
        WHERE EXISTS (
          SELECT 1 FROM enrollments e
          JOIN products pr ON pr.id = e.product_id
          WHERE e.participant_id = p.id AND e.active = TRUE
            AND (v_season_id IS NULL OR pr.season_id = v_season_id)
        )
        GROUP BY 1
      ) t
    ), '[]'::json),
    'by_tenure', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.sort_order)
      FROM (
        SELECT bucket, sort_order, COUNT(*)::int AS cnt
        FROM (
          SELECT p.id,
            CASE
              WHEN p.first_enrolled_at IS NULL THEN 'unknown'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '3 months' THEN '0-3m'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '12 months' THEN '3-12m'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '24 months' THEN '1-2y'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '36 months' THEN '2-3y'
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '60 months' THEN '3-5y'
              ELSE '5y+'
            END AS bucket,
            CASE
              WHEN p.first_enrolled_at IS NULL THEN 0
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '3 months' THEN 1
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '12 months' THEN 2
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '24 months' THEN 3
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '36 months' THEN 4
              WHEN p.first_enrolled_at > CURRENT_DATE - INTERVAL '60 months' THEN 5
              ELSE 6
            END AS sort_order
          FROM participants p
          WHERE EXISTS (
            SELECT 1 FROM enrollments e
            JOIN products pr ON pr.id = e.product_id
            WHERE e.participant_id = p.id AND e.active = TRUE
              AND (v_season_id IS NULL OR pr.season_id = v_season_id)
          )
        ) sub
        GROUP BY bucket, sort_order
      ) t
    ), '[]'::json)
  );
END;
$$;

-- ── 3. get_revenue_breakdown ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_breakdown(
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_domain json;
  v_monthly json;
  v_avg numeric;
  v_paying integer;
  v_total numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.domain), '[]'::json)
  INTO v_by_domain
  FROM (
    SELECT
      CASE
        WHEN pt.code IN ('annual_section') THEN 'annual'
        WHEN pt.code IN ('summer_course') THEN 'summer'
        WHEN pt.code = 'swim_assessment' THEN 'assessment'
        ELSE pt.code
      END AS domain,
      COUNT(*) FILTER (WHERE e.payment_status = 'paid')::int AS paid_count,
      COALESCE(SUM(CASE WHEN e.payment_status = 'paid' THEN COALESCE(p.price, 0) ELSE 0 END), 0)::numeric(12,2) AS revenue
    FROM enrollments e
    JOIN products p ON p.id = e.product_id
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE e.active = TRUE
      AND e.valid_from BETWEEN p_from AND p_to
    GROUP BY 1
    UNION ALL
    SELECT
      'private' AS domain,
      COUNT(*) FILTER (WHERE l.payment_status = 'paid')::int,
      COALESCE(SUM(CASE WHEN l.payment_status = 'paid' THEN COALESCE(l.price, 0) ELSE 0 END), 0)::numeric(12,2)
    FROM lessons l
    WHERE NOT l.cancelled
      AND l.lesson_date BETWEEN p_from AND p_to
  ) t;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.month_start), '[]'::json)
  INTO v_monthly
  FROM (
    SELECT
      date_trunc('month', sub.dt)::date AS month_start,
      COALESCE(SUM(sub.amount), 0)::numeric(12,2) AS revenue
    FROM (
      SELECT e.valid_from AS dt,
        CASE WHEN e.payment_status = 'paid' THEN COALESCE(p.price, 0) ELSE 0 END AS amount
      FROM enrollments e
      JOIN products p ON p.id = e.product_id
      WHERE e.active = TRUE AND e.valid_from BETWEEN p_from AND p_to
      UNION ALL
      SELECT l.lesson_date,
        CASE WHEN l.payment_status = 'paid' THEN COALESCE(l.price, 0) ELSE 0 END
      FROM lessons l
      WHERE NOT l.cancelled AND l.lesson_date BETWEEN p_from AND p_to
    ) sub
    WHERE sub.amount > 0
    GROUP BY 1
  ) t;

  SELECT
    COUNT(DISTINCT payer_id)::int,
    COALESCE(SUM(rev), 0)::numeric(12,2)
  INTO v_paying, v_total
  FROM (
    SELECT e.participant_id AS payer_id,
      CASE WHEN e.payment_status = 'paid' THEN COALESCE(p.price, 0) ELSE 0 END AS rev
    FROM enrollments e
    JOIN products p ON p.id = e.product_id
    WHERE e.active = TRUE AND e.valid_from BETWEEN p_from AND p_to
      AND e.payment_status = 'paid'
    UNION ALL
    SELECT NULL::uuid,
      CASE WHEN l.payment_status = 'paid' THEN COALESCE(l.price, 0) ELSE 0 END
    FROM lessons l
    WHERE NOT l.cancelled AND l.lesson_date BETWEEN p_from AND p_to
      AND l.payment_status = 'paid'
  ) payers;

  v_avg := CASE WHEN v_paying > 0 THEN ROUND(v_total / v_paying, 2) ELSE 0 END;

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'by_domain', v_by_domain,
    'monthly', v_monthly,
    'total_revenue', v_total,
    'paying_customers', v_paying,
    'avg_per_customer', v_avg
  );
END;
$$;

-- ── 4. get_instructor_analytics ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_instructor_analytics(
  p_from date,
  p_to date,
  p_instructor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.instructor_name)
    FROM (
      SELECT
        COALESCE(pr.instructor_id, pf.id) AS instructor_id,
        COALESCE(pr.instructor_name, pf.full_name, '—') AS instructor_name,
        pf.hired_at,
        COUNT(DISTINCT e.participant_id)::int AS student_count,
        COUNT(DISTINCT pr.id)::int AS group_count,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (pr.end_time - pr.start_time)) / 3600.0
        ), 0)::numeric(10,1) AS weekly_hours,
        ROUND(
          100.0 * COUNT(e.id) FILTER (WHERE pr.capacity IS NOT NULL)
            / NULLIF(SUM(pr.capacity), 0),
          1
        ) AS occupancy_pct,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE ae.status = 'present')
            / NULLIF(COUNT(ae.id), 0),
          1
        ) AS attendance_pct,
        COALESCE(SUM(
          CASE WHEN e.payment_status = 'paid' THEN COALESCE(pr.price, 0) ELSE 0 END
        ), 0)::numeric(12,2) AS revenue_to_school
      FROM products pr
      LEFT JOIN profiles pf ON pf.id = pr.instructor_id
      JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
      LEFT JOIN scheduled_sessions ss ON ss.product_id = pr.id
        AND ss.session_date BETWEEN p_from AND p_to
        AND ss.status <> 'cancelled'
      LEFT JOIN attendance_events ae ON ae.scheduled_session_id = ss.id
        AND ae.enrollment_id = e.id
      WHERE (p_instructor_id IS NULL OR pr.instructor_id = p_instructor_id
        OR (p_instructor_id IS NOT NULL AND pf.id = p_instructor_id))
      GROUP BY COALESCE(pr.instructor_id, pf.id), COALESCE(pr.instructor_name, pf.full_name, '—'), pf.hired_at
    ) t
  ), '[]'::json);
END;
$$;

-- ── 5. get_attendance_summary ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_attendance_summary(
  p_from date,
  p_to date,
  p_group_by text DEFAULT 'product'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF p_group_by = 'participant' THEN
    RETURN COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.label)
      FROM (
        SELECT
          part.id AS entity_id,
          part.full_name AS label,
          COUNT(*) FILTER (WHERE ae.status = 'present')::int AS present_count,
          COUNT(*) FILTER (WHERE ae.status = 'absent')::int AS absent_count,
          COUNT(*)::int AS total_marks,
          ROUND(100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0), 1) AS attendance_rate
        FROM attendance_events ae
        JOIN participants part ON part.id = ae.participant_id
        LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        LEFT JOIN lessons l ON l.id = ae.lesson_id
        WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to
        GROUP BY part.id, part.full_name
      ) t
    ), '[]'::json);
  ELSIF p_group_by = 'instructor' THEN
    RETURN COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.label)
      FROM (
        SELECT
          COALESCE(pr.instructor_id::text, pr.instructor_name) AS entity_id,
          COALESCE(pr.instructor_name, '—') AS label,
          COUNT(*) FILTER (WHERE ae.status = 'present')::int AS present_count,
          COUNT(*) FILTER (WHERE ae.status = 'absent')::int AS absent_count,
          COUNT(*)::int AS total_marks,
          ROUND(100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0), 1) AS attendance_rate
        FROM attendance_events ae
        JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        JOIN products pr ON pr.id = ss.product_id
        WHERE ss.session_date BETWEEN p_from AND p_to
        GROUP BY COALESCE(pr.instructor_id::text, pr.instructor_name), pr.instructor_name
      ) t
    ), '[]'::json);
  ELSE
    RETURN COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.label)
      FROM (
        SELECT
          pr.id AS entity_id,
          pr.name AS label,
          COUNT(*) FILTER (WHERE ae.status = 'present')::int AS present_count,
          COUNT(*) FILTER (WHERE ae.status = 'absent')::int AS absent_count,
          COUNT(*)::int AS total_marks,
          ROUND(100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0), 1) AS attendance_rate
        FROM attendance_events ae
        JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        JOIN products pr ON pr.id = ss.product_id
        WHERE ss.session_date BETWEEN p_from AND p_to
        GROUP BY pr.id, pr.name
      ) t
    ), '[]'::json);
  END IF;
END;
$$;

-- ── 6. get_marketing_funnel ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_marketing_funnel(
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leads integer;
  v_assessed integer;
  v_passed integer;
  v_enrolled integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*)::int INTO v_leads
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.status IN ('new', 'call', 'registered_assessment');

  SELECT COUNT(*)::int INTO v_assessed
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.status = 'registered_assessment';

  SELECT COUNT(*)::int INTO v_passed
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.assessment_result = 'passed';

  SELECT COUNT(DISTINCT al.participant_id)::int INTO v_enrolled
  FROM assessment_leads al
  JOIN enrollments e ON e.participant_id = al.participant_id AND e.active = TRUE
  JOIN products p ON p.id = e.product_id
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND pt.code = 'annual_section';

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'leads', v_leads,
    'assessed', v_assessed,
    'passed', v_passed,
    'enrolled_annual', v_enrolled,
    'conversion_assessed', CASE WHEN v_leads > 0 THEN ROUND(100.0 * v_assessed / v_leads, 1) ELSE 0 END,
    'conversion_enrolled', CASE WHEN v_assessed > 0 THEN ROUND(100.0 * v_enrolled / v_assessed, 1) ELSE 0 END,
    'by_source', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.cnt DESC)
      FROM (
        SELECT al.source, COUNT(*)::int AS cnt
        FROM assessment_leads al
        WHERE al.created_at::date BETWEEN p_from AND p_to
        GROUP BY al.source
      ) t
    ), '[]'::json)
  );
END;
$$;

-- ── 7. get_operations_daily ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_operations_daily(
  p_date date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.start_time)
    FROM (
      SELECT
        ss.id AS session_id,
        pr.id AS product_id,
        pr.name AS product_name,
        pr.instructor_name,
        ss.start_time,
        ss.end_time,
        ss.status,
        COUNT(DISTINCT sa.enrollment_id)::int AS enrolled,
        pr.capacity,
        CASE
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id) >= pr.capacity THEN 'full'
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id)::numeric / pr.capacity >= 0.8 THEN 'high'
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id)::numeric / NULLIF(pr.capacity, 0) < 0.5 THEN 'low'
          ELSE 'normal'
        END AS fill_status
      FROM scheduled_sessions ss
      JOIN products pr ON pr.id = ss.product_id
      LEFT JOIN session_attendees sa ON sa.session_id = ss.id
      LEFT JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
      WHERE ss.session_date = p_date
        AND ss.status <> 'cancelled'
      GROUP BY ss.id, pr.id, pr.name, pr.instructor_name, ss.start_time, ss.end_time, ss.status, pr.capacity
    ) t
  ), '[]'::json);
END;
$$;

-- ── 8. get_school_health_score ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_school_health_score(
  p_month date DEFAULT date_trunc('month', CURRENT_DATE)::date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_month_end date;
  v_occupancy numeric;
  v_new_count integer;
  v_churn_count integer;
  v_growth_ratio numeric;
  v_occupancy_score numeric;
  v_growth_score numeric;
  v_total numeric;
  v_color text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT * INTO v_settings FROM school_health_settings ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    v_settings := ROW(
      gen_random_uuid(), 60::numeric, 40::numeric, 80::numeric, 60::numeric, NOW(), NULL::uuid
    );
  END IF;

  v_month_end := (v_month + INTERVAL '1 month' - INTERVAL '1 day')::date;

  SELECT COALESCE(
    ROUND(100.0 * COUNT(e.id) / NULLIF(SUM(p.capacity), 0), 1),
    0
  ) INTO v_occupancy
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE p.capacity IS NOT NULL
    AND e.valid_from <= v_month_end AND e.valid_until >= v_month;

  SELECT COUNT(DISTINCT participant_id)::int INTO v_new_count
  FROM enrollments
  WHERE valid_from BETWEEN v_month AND v_month_end;

  SELECT COUNT(*)::int INTO v_churn_count
  FROM enrollments
  WHERE cancelled_at::date BETWEEN v_month AND v_month_end;

  v_growth_ratio := CASE
    WHEN v_churn_count = 0 AND v_new_count > 0 THEN 100
    WHEN v_churn_count = 0 THEN 50
    ELSE LEAST(100, GREATEST(0, ROUND(100.0 * v_new_count / v_churn_count, 1)))
  END;

  v_occupancy_score := LEAST(100, v_occupancy);
  v_growth_score := v_growth_ratio;
  v_total := ROUND(
    (v_occupancy_score * v_settings.occupancy_weight
     + v_growth_score * v_settings.growth_ratio_weight) / 100.0,
    1
  );

  v_color := CASE
    WHEN v_total >= v_settings.green_min THEN 'green'
    WHEN v_total >= v_settings.yellow_min THEN 'yellow'
    ELSE 'red'
  END;

  RETURN json_build_object(
    'month', v_month,
    'score', v_total,
    'color', v_color,
    'occupancy_pct', v_occupancy,
    'occupancy_component', v_occupancy_score,
    'growth_ratio', v_growth_ratio,
    'growth_component', v_growth_score,
    'new_count', v_new_count,
    'churn_count', v_churn_count,
    'weights', json_build_object(
      'occupancy', v_settings.occupancy_weight,
      'growth', v_settings.growth_ratio_weight
    ),
    'thresholds', json_build_object(
      'green_min', v_settings.green_min,
      'yellow_min', v_settings.yellow_min
    )
  );
END;
$$;

-- ── 9. get_occupancy_trend ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_occupancy_trend(
  p_from date,
  p_to date,
  p_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid := p_season_id;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.week_start)
    FROM (
      SELECT
        w.week_start::date AS week_start,
        COUNT(e.id)::int AS enrolled,
        COALESCE(SUM(p.capacity), 0)::int AS capacity,
        ROUND(100.0 * COUNT(e.id) / NULLIF(SUM(p.capacity), 0), 1) AS occupancy_pct
      FROM generate_series(
        date_trunc('week', p_from)::date,
        date_trunc('week', p_to)::date,
        '7 days'::interval
      ) AS w(week_start)
      CROSS JOIN products p
      LEFT JOIN enrollments e ON e.product_id = p.id
        AND e.active = TRUE
        AND e.valid_from <= (w.week_start::date + 6)
        AND e.valid_until >= w.week_start::date
      WHERE p.capacity IS NOT NULL
        AND (v_season_id IS NULL OR p.season_id = v_season_id)
      GROUP BY w.week_start::date
    ) t
  ), '[]'::json);
END;
$$;

-- ── 10. generate_operational_alerts ───────────────────────────
CREATE OR REPLACE FUNCTION public.generate_operational_alerts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_rec record;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  FOR v_rec IN
    WITH ordered AS (
      SELECT
        ae.enrollment_id,
        ae.participant_id,
        COALESCE(ss.session_date, l.lesson_date) AS session_date,
        ae.status,
        ROW_NUMBER() OVER (
          PARTITION BY ae.enrollment_id
          ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC
        ) AS rn
      FROM attendance_events ae
      LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
      LEFT JOIN lessons l ON l.id = ae.lesson_id
      WHERE ae.status IN ('present', 'absent')
    ),
    streaks AS (
      SELECT enrollment_id, participant_id,
        COUNT(*) FILTER (WHERE status = 'absent') AS consecutive_absences
      FROM ordered
      WHERE rn <= 3
      GROUP BY enrollment_id, participant_id
      HAVING COUNT(*) = 3 AND COUNT(*) FILTER (WHERE status = 'absent') = 3
    )
    SELECT
      s.enrollment_id,
      s.participant_id,
      p.full_name AS child_name
    FROM streaks s
    JOIN participants p ON p.id = s.participant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'consecutive_absences'
        AND oa.entity_type = 'enrollment'
        AND oa.entity_id = s.enrollment_id
        AND oa.acknowledged_at IS NULL
    )
  LOOP
    INSERT INTO operational_alerts (
      alert_type, severity, entity_type, entity_id, title, payload
    ) VALUES (
      'consecutive_absences',
      'warn',
      'enrollment',
      v_rec.enrollment_id,
      '3 היעדרויות ברצף: ' || v_rec.child_name,
      json_build_object('participant_id', v_rec.participant_id)
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'inserted', v_inserted);
END;
$$;

-- ── Grants ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cc_active_student_ids(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_active_student_ids(date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_school_overview_kpis(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_overview_kpis(date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_student_demographics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_demographics(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_breakdown(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_breakdown(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_instructor_analytics(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_analytics(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_attendance_summary(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(date, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_marketing_funnel(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketing_funnel(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_operations_daily(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operations_daily(date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_school_health_score(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_health_score(date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_occupancy_trend(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupancy_trend(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_operational_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_operational_alerts() TO authenticated;

SELECT 'Command Center analytics migration complete' AS status;


-- ── supabase_migration_command_center_alerts_extend.sql ──

-- Command Center — extend operational alerts (churn + capacity) + daily cron

CREATE OR REPLACE FUNCTION public.generate_operational_alerts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_rec record;
  v_next_season_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT id INTO v_next_season_id
  FROM seasons
  WHERE start_date > COALESCE(
    (SELECT start_date FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1),
    CURRENT_DATE
  )
  ORDER BY start_date ASC
  LIMIT 1;

  -- 1. Consecutive absences (3 in a row)
  FOR v_rec IN
    WITH ordered AS (
      SELECT
        ae.enrollment_id,
        ae.participant_id,
        ae.status,
        ROW_NUMBER() OVER (
          PARTITION BY ae.enrollment_id
          ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC
        ) AS rn
      FROM attendance_events ae
      LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
      LEFT JOIN lessons l ON l.id = ae.lesson_id
      WHERE ae.status IN ('present', 'absent')
    ),
    streaks AS (
      SELECT enrollment_id, participant_id
      FROM ordered
      WHERE rn <= 3
      GROUP BY enrollment_id, participant_id
      HAVING COUNT(*) = 3 AND COUNT(*) FILTER (WHERE status = 'absent') = 3
    )
    SELECT s.enrollment_id, s.participant_id, p.full_name AS child_name
    FROM streaks s
    JOIN participants p ON p.id = s.participant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'consecutive_absences'
        AND oa.entity_type = 'enrollment'
        AND oa.entity_id = s.enrollment_id
        AND oa.acknowledged_at IS NULL
    )
  LOOP
    INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
    VALUES (
      'consecutive_absences', 'warn', 'enrollment', v_rec.enrollment_id,
      '3 היעדרויות ברצף: ' || v_rec.child_name,
      json_build_object('participant_id', v_rec.participant_id)
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  -- 2. Churn risk: active enrollment + 2+ absences in last 3 + no next-season enrollment
  IF v_next_season_id IS NOT NULL THEN
    FOR v_rec IN
      WITH ordered AS (
        SELECT
          ae.enrollment_id,
          ae.participant_id,
          ae.status,
          ROW_NUMBER() OVER (
            PARTITION BY ae.enrollment_id
            ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC
          ) AS rn
        FROM attendance_events ae
        JOIN enrollments e ON e.id = ae.enrollment_id AND e.active = TRUE
        LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        LEFT JOIN lessons l ON l.id = ae.lesson_id
        WHERE ae.status IN ('present', 'absent')
      ),
      at_risk AS (
        SELECT DISTINCT o.participant_id
        FROM ordered o
        WHERE o.rn <= 3
        GROUP BY o.enrollment_id, o.participant_id
        HAVING COUNT(*) FILTER (WHERE o.status = 'absent') >= 2
      )
      SELECT ar.participant_id, p.full_name AS child_name
      FROM at_risk ar
      JOIN participants p ON p.id = ar.participant_id
      WHERE NOT EXISTS (
        SELECT 1 FROM enrollments e
        JOIN products pr ON pr.id = e.product_id
        WHERE e.participant_id = ar.participant_id
          AND e.active = TRUE
          AND pr.season_id = v_next_season_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM operational_alerts oa
        WHERE oa.alert_type = 'churn_risk'
          AND oa.entity_type = 'participant'
          AND oa.entity_id = ar.participant_id
          AND oa.acknowledged_at IS NULL
      )
    LOOP
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES (
        'churn_risk', 'warn', 'participant', v_rec.participant_id,
        'סיכון עזיבה: ' || v_rec.child_name,
        json_build_object('participant_id', v_rec.participant_id, 'next_season_id', v_next_season_id)
      );
      v_inserted := v_inserted + 1;
    END LOOP;
  END IF;

  -- 3. Capacity full
  FOR v_rec IN
    SELECT pr.id AS product_id, pr.name AS product_name, COUNT(e.id)::int AS enrolled, pr.capacity
    FROM products pr
    JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
    WHERE pr.capacity IS NOT NULL AND pr.capacity > 0
    GROUP BY pr.id, pr.name, pr.capacity
    HAVING COUNT(e.id) >= pr.capacity
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'capacity_full'
        AND oa.entity_type = 'product'
        AND oa.entity_id = v_rec.product_id
        AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES (
        'capacity_full', 'info', 'product', v_rec.product_id,
        'קבוצה מלאה: ' || v_rec.product_name,
        json_build_object('enrolled', v_rec.enrolled, 'capacity', v_rec.capacity)
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- 4. Capacity low (<50%, capacity >= 4)
  FOR v_rec IN
    SELECT pr.id AS product_id, pr.name AS product_name, COUNT(e.id)::int AS enrolled, pr.capacity
    FROM products pr
    LEFT JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
    WHERE pr.capacity IS NOT NULL AND pr.capacity >= 4
    GROUP BY pr.id, pr.name, pr.capacity
    HAVING COUNT(e.id)::numeric / pr.capacity < 0.5
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'capacity_low'
        AND oa.entity_type = 'product'
        AND oa.entity_id = v_rec.product_id
        AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES (
        'capacity_low', 'warn', 'product', v_rec.product_id,
        'תפוסה נמוכה: ' || v_rec.product_name,
        json_build_object('enrolled', v_rec.enrolled, 'capacity', v_rec.capacity)
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'inserted', v_inserted);
END;
$$;

DO $cron$
DECLARE
  jid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'command_center_daily_alerts'
    LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;

    PERFORM cron.schedule(
      'command_center_daily_alerts',
      '0 7 * * *',
      $job$SELECT public.generate_operational_alerts();$job$
    );
  END IF;
END;
$cron$;

SELECT 'Command Center alerts extension complete' AS status;


-- ── supabase_migration_command_center_operations_extend.sql ──

-- Command Center — extend get_operations_daily with substitute instructor info

CREATE OR REPLACE FUNCTION public.get_operations_daily(
  p_date date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.start_time)
    FROM (
      SELECT
        ss.id AS session_id,
        pr.id AS product_id,
        pr.name AS product_name,
        COALESCE(o.instructor_name, pr.instructor_name) AS instructor_name,
        pr.instructor_name AS product_instructor_name,
        (o.id IS NOT NULL) AS is_substitute,
        o.instructor_name AS substitute_name,
        o.reason AS substitute_reason,
        ss.start_time,
        ss.end_time,
        ss.status,
        COUNT(DISTINCT sa.enrollment_id)::int AS enrolled,
        pr.capacity,
        CASE
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id) >= pr.capacity THEN 'full'
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id)::numeric / pr.capacity >= 0.8 THEN 'high'
          WHEN pr.capacity IS NOT NULL AND COUNT(DISTINCT sa.enrollment_id)::numeric / NULLIF(pr.capacity, 0) < 0.5 THEN 'low'
          ELSE 'normal'
        END AS fill_status
      FROM scheduled_sessions ss
      JOIN products pr ON pr.id = ss.product_id
      LEFT JOIN session_instructor_overrides o ON o.scheduled_session_id = ss.id
      LEFT JOIN session_attendees sa ON sa.session_id = ss.id
      LEFT JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
      WHERE ss.session_date = p_date
        AND ss.status <> 'cancelled'
      GROUP BY
        ss.id, pr.id, pr.name, pr.instructor_name,
        o.id, o.instructor_name, o.reason,
        ss.start_time, ss.end_time, ss.status, pr.capacity
    ) t
  ), '[]'::json);
END;
$$;

SELECT 'Command Center operations extension complete' AS status;


-- ── supabase_migration_command_center_perf_indexes.sql ──

-- Command Center — performance indexes for analytics RPCs

CREATE INDEX IF NOT EXISTS enrollments_active_product_idx
  ON enrollments (product_id)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS enrollments_cancelled_at_idx
  ON enrollments (cancelled_at)
  WHERE cancelled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS scheduled_sessions_date_product_idx
  ON scheduled_sessions (session_date, product_id);

CREATE INDEX IF NOT EXISTS attendance_events_status_idx
  ON attendance_events (status, enrollment_id);

CREATE INDEX IF NOT EXISTS assessment_leads_created_at_idx
  ON assessment_leads (created_at);


-- ── supabase_migration_fix_revenue_by_season.sql ──

-- Fix get_revenue_by_season: avoid JOIN fan-out inflating SUM(br.amount).

CREATE OR REPLACE FUNCTION public.get_revenue_by_season(p_season_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.season_name)
    FROM (
      SELECT
        s.id AS season_id,
        s.name AS season_name,
        (
          SELECT COUNT(*)::int
          FROM billing_records br
          WHERE br.season_id = s.id AND br.payment_status = 'paid'
        ) AS paid_count,
        (
          SELECT COUNT(*)::int
          FROM enrollments e
          JOIN products p ON p.id = e.product_id
          WHERE p.season_id = s.id AND e.payment_status = 'unpaid' AND e.active
        ) AS unpaid_count,
        (
          SELECT COUNT(*)::int
          FROM enrollments e
          JOIN products p ON p.id = e.product_id
          WHERE p.season_id = s.id AND e.payment_status = 'waived' AND e.active
        ) AS waived_count,
        (
          COALESCE((
            SELECT SUM(br.amount)
            FROM billing_records br
            WHERE br.season_id = s.id AND br.payment_status = 'paid'
          ), 0)
          + COALESCE((
            SELECT SUM(COALESCE(p2.price, 0))
            FROM enrollments e2
            JOIN products p2 ON p2.id = e2.product_id
            WHERE e2.payment_status = 'paid'
              AND e2.active
              AND p2.season_id = s.id
              AND NOT EXISTS (
                SELECT 1 FROM billing_records br2 WHERE br2.enrollment_id = e2.id
              )
          ), 0)
        )::numeric(12,2) AS gross_revenue
      FROM seasons s
      WHERE p_season_id IS NULL OR s.id = p_season_id
    ) t
  ), '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION public.get_revenue_by_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_season(uuid) TO authenticated;


-- ── supabase_migration_fix_occupancy_trend.sql ──

-- Fix get_occupancy_trend: week_start + integer fails on timestamptz from generate_series

CREATE OR REPLACE FUNCTION public.get_occupancy_trend(
  p_from date,
  p_to date,
  p_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id uuid := p_season_id;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.week_start)
    FROM (
      SELECT
        w.week_start::date AS week_start,
        COUNT(e.id)::int AS enrolled,
        COALESCE(SUM(p.capacity), 0)::int AS capacity,
        ROUND(100.0 * COUNT(e.id) / NULLIF(SUM(p.capacity), 0), 1) AS occupancy_pct
      FROM generate_series(
        date_trunc('week', p_from)::date,
        date_trunc('week', p_to)::date,
        '7 days'::interval
      ) AS w(week_start)
      CROSS JOIN products p
      LEFT JOIN enrollments e ON e.product_id = p.id
        AND e.active = TRUE
        AND e.valid_from <= (w.week_start::date + 6)
        AND e.valid_until >= w.week_start::date
      WHERE p.capacity IS NOT NULL
        AND (v_season_id IS NULL OR p.season_id = v_season_id)
      GROUP BY w.week_start::date
    ) t
  ), '[]'::json);
END;
$$;

SELECT 'get_occupancy_trend fix applied' AS status;


-- ── supabase_migration_fix_list_due_lead_tasks.sql ──

-- Fix list_due_lead_tasks: include created_at in subquery for ORDER BY
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


-- ── supabase_migration_stream_line_cron.sql ──

-- Schedule weekly session + pass generation (Sundays 06:00 UTC)
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

