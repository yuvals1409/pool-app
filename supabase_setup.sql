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
  used            BOOLEAN DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. ROW LEVEL SECURITY ──────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons  ENABLE ROW LEVEL SECURITY;

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
