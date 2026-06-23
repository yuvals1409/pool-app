-- ============================================================
--  Master sheet sync — tc_leads source + row link enhancements
-- ============================================================

-- Extend lead source for tc-leads.co.il landing page
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
  IF v_source IN ('recommendation', 'facebook', 'instagram', 'website', 'signage', 'import', 'tc_leads') THEN
    RETURN v_source;
  END IF;
  IF v_source IN ('web', 'אתר', 'אתר אינטרנט') THEN RETURN 'website'; END IF;
  IF v_source IN ('פייסבוק', 'fb') THEN RETURN 'facebook'; END IF;
  IF v_source IN ('אינסטגרם', 'ig', 'instagram') THEN RETURN 'instagram'; END IF;
  IF v_source IN ('מפה לאוזן', 'המלצה', 'פה לאוזן', 'word of mouth') THEN RETURN 'recommendation'; END IF;
  IF v_source IN ('שילוט', 'signage') THEN RETURN 'signage'; END IF;
  IF v_source IN ('tc-leads', 'tc leads', 'tcleads') THEN RETURN 'tc_leads'; END IF;
  RETURN 'website';
END;
$$;

ALTER TABLE assessment_leads DROP CONSTRAINT IF EXISTS assessment_leads_source_check;
ALTER TABLE assessment_leads ADD CONSTRAINT assessment_leads_source_check
  CHECK (source IN ('facebook', 'instagram', 'recommendation', 'website', 'signage', 'import', 'tc_leads'));

-- Master row links: stable UUID from sheet מזהה_שורה
ALTER TABLE sheet_row_links
  ADD COLUMN IF NOT EXISTS master_row_id TEXT;

CREATE INDEX IF NOT EXISTS sheet_row_links_master_row_idx
  ON sheet_row_links (master_row_id)
  WHERE master_row_id IS NOT NULL;

-- Config for master sheet sync (global ready flag stored in sheet; mirror optional)
CREATE TABLE IF NOT EXISTS master_sheet_config (
  id                    INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  spreadsheet_id        TEXT,
  leads_spreadsheet_id  TEXT,
  global_ready          BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at          TIMESTAMPTZ,
  last_sync_status      TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO master_sheet_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE master_sheet_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read master sheet config" ON master_sheet_config;
CREATE POLICY "admin read master sheet config"
  ON master_sheet_config FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin manage master sheet config" ON master_sheet_config;
CREATE POLICY "admin manage master sheet config"
  ON master_sheet_config FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Daily cron: configure in Supabase Dashboard → Database → Cron Jobs
-- or invoke POST /functions/v1/sync-google-sheets {"mode":"master","direction":"pull"}
-- Recommended schedule: 0 5 * * * (05:00 UTC daily)
