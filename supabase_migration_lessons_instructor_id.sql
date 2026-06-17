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
