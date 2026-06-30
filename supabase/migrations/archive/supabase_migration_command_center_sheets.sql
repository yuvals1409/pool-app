-- ============================================================
--  Command Center — Sheets sync support (שלב 3)
-- ============================================================

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS gender_manual_at TIMESTAMPTZ;

SELECT 'gender_manual_at column ready' AS status;
