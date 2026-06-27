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

