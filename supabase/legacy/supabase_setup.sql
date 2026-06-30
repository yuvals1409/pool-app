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
