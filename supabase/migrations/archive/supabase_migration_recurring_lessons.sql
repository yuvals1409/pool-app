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
