-- ── 1. get_school_overview_kpis ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_school_overview_kpis(
  p_as_of date DEFAULT CURRENT_DATE,
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
  v_active_students integer;
  v_active_groups integer;
  v_active_instructors integer;
  v_enrolled integer;
  v_capacity integer;
  v_occupancy numeric;
  v_new_month integer;
  v_churned_month integer;
  v_private_lessons integer;
  v_month_start date;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  IF v_season_id IS NULL THEN
    SELECT id INTO v_season_id FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1;
  END IF;

  v_month_start := date_trunc('month', p_as_of)::date;

  SELECT COUNT(*)::int INTO v_active_students
  FROM public.cc_active_student_ids(p_as_of, v_season_id);

  SELECT COUNT(DISTINCT p.id)::int INTO v_active_groups
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  SELECT COUNT(DISTINCT COALESCE(p.instructor_id::text, p.instructor_name))::int
  INTO v_active_instructors
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  SELECT
    COUNT(*)::int,
    COALESCE(SUM(p.capacity), 0)::int
  INTO v_enrolled, v_capacity
  FROM products p
  JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
  WHERE p.capacity IS NOT NULL
    AND (v_season_id IS NULL OR p.season_id = v_season_id)
    AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of;

  v_occupancy := CASE WHEN v_capacity > 0
    THEN ROUND(100.0 * v_enrolled / v_capacity, 1) ELSE 0 END;

  SELECT COUNT(DISTINCT e.participant_id)::int INTO v_new_month
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  WHERE e.valid_from >= v_month_start
    AND e.valid_from <= p_as_of
    AND (v_season_id IS NULL OR p.season_id = v_season_id);

  SELECT COUNT(*)::int INTO v_churned_month
  FROM enrollments e
  JOIN products p ON p.id = e.product_id
  WHERE e.active = FALSE
    AND e.cancelled_at IS NOT NULL
    AND e.cancelled_at::date >= v_month_start
    AND e.cancelled_at::date <= p_as_of
    AND (v_season_id IS NULL OR p.season_id = v_season_id);

  SELECT COUNT(*)::int INTO v_private_lessons
  FROM lessons
  WHERE NOT cancelled
    AND lesson_date >= p_as_of;

  RETURN json_build_object(
    'as_of', p_as_of,
    'season_id', v_season_id,
    'active_students', v_active_students,
    'active_groups', v_active_groups,
    'active_instructors', v_active_instructors,
    'occupancy_pct', v_occupancy,
    'enrolled_seats', v_enrolled,
    'total_capacity', v_capacity,
    'new_this_month', v_new_month,
    'churned_this_month', v_churned_month,
    'active_private_lessons', v_private_lessons
  );
END;
$$;

