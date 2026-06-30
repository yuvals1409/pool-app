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
