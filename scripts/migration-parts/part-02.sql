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

