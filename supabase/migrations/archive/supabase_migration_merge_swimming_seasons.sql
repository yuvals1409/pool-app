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
