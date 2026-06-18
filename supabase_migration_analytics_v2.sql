-- ============================================================
--  Stream Line OS — Analytics v2
--  דוחות מנהל: מדריך, סריקה מול נוכחות, הכנסות, משפך מבדקים
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT NULL;

-- ── attendance by instructor ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_attendance_by_instructor(
  p_from date,
  p_to date,
  p_product_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.instructor_name)
      FROM (
        SELECT
          COALESCE(pr.instructor_name, l.instructor_name, '—') AS instructor_name,
          COUNT(*) FILTER (WHERE ae.status = 'present') AS present_count,
          COUNT(*) FILTER (WHERE ae.status = 'absent') AS absent_count,
          COUNT(*) AS total_marks,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE ae.status = 'present') / NULLIF(COUNT(*), 0),
            1
          ) AS attendance_rate
        FROM attendance_events ae
        LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        LEFT JOIN lessons l ON l.id = ae.lesson_id
        LEFT JOIN products pr ON pr.id = ss.product_id
        WHERE COALESCE(ss.session_date, l.lesson_date) BETWEEN p_from AND p_to
          AND (p_product_id IS NULL OR pr.id = p_product_id)
        GROUP BY 1
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── scan vs attendance ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_scan_vs_attendance(
  p_from date,
  p_to date,
  p_product_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.week_start)
      FROM (
        SELECT
          date_trunc('week', ss.session_date)::date AS week_start,
          COUNT(DISTINCT sa.id) AS expected,
          COUNT(*) FILTER (
            WHERE ae.source = 'guard_scan' AND ae.status = 'present'
          ) AS scanned,
          COUNT(*) FILTER (
            WHERE ae.source = 'instructor' AND ae.status = 'present'
          ) AS instructor_marked,
          COUNT(*) FILTER (WHERE ae.status = 'present') AS total_present,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE ae.source = 'guard_scan' AND ae.status = 'present')
              / NULLIF(COUNT(DISTINCT sa.id), 0),
            1
          ) AS scan_rate_pct,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE ae.status = 'present')
              / NULLIF(COUNT(DISTINCT sa.id), 0),
            1
          ) AS attendance_rate_pct
        FROM scheduled_sessions ss
        JOIN session_attendees sa ON sa.session_id = ss.id
        JOIN enrollments e ON e.id = sa.enrollment_id AND e.active = TRUE
        LEFT JOIN attendance_events ae
          ON ae.scheduled_session_id = ss.id
          AND ae.enrollment_id = sa.enrollment_id
        JOIN products pr ON pr.id = ss.product_id
        WHERE ss.session_date BETWEEN p_from AND p_to
          AND ss.status <> 'cancelled'
          AND (p_product_id IS NULL OR pr.id = p_product_id)
        GROUP BY 1
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── revenue by season ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_revenue_by_season(p_season_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t) ORDER BY t.season_start DESC)
      FROM (
        SELECT
          s.id AS season_id,
          s.name AS season_name,
          s.start_date AS season_start,
          COUNT(*) FILTER (WHERE e.payment_status = 'paid')::int AS paid_count,
          COUNT(*) FILTER (WHERE e.payment_status = 'unpaid')::int AS unpaid_count,
          COUNT(*) FILTER (WHERE e.payment_status = 'waived')::int AS waived_count,
          COALESCE(SUM(
            CASE WHEN e.payment_status = 'paid' THEN COALESCE(p.price, 0) ELSE 0 END
          ), 0)::numeric(12,2) AS gross_revenue,
          COALESCE(SUM(COALESCE(p.price, 0)), 0)::numeric(12,2) AS potential_revenue
        FROM seasons s
        JOIN products p ON p.season_id = s.id
        JOIN enrollments e ON e.product_id = p.id AND e.active = TRUE
        WHERE p_season_id IS NULL OR s.id = p_season_id
        GROUP BY s.id, s.name, s.start_date
      ) t
    ),
    '[]'::json
  );
END;
$$;

-- ── assessment conversion funnel ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_assessment_conversion_funnel(
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_registered integer;
  v_passed integer;
  v_failed integer;
  v_summer integer;
  v_class integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*) INTO v_registered
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.status <> 'abandoned';

  SELECT COUNT(*) INTO v_passed
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.assessment_result = 'passed';

  SELECT COUNT(*) INTO v_failed
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.assessment_result = 'failed';

  SELECT COUNT(*) INTO v_summer
  FROM summer_invitations si
  JOIN assessment_leads al ON al.id = si.assessment_lead_id
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND si.used_at IS NOT NULL;

  SELECT COUNT(*) INTO v_class
  FROM assessment_leads al
  JOIN assessment_slots s ON s.id = al.slot_id
  WHERE s.slot_date BETWEEN p_from AND p_to
    AND al.status = 'registered_class';

  RETURN json_build_object(
    'registered', v_registered,
    'passed', v_passed,
    'failed', v_failed,
    'summer_enrolled', v_summer,
    'class_enrolled', v_class,
    'pass_rate', CASE WHEN v_registered > 0
      THEN ROUND(100.0 * v_passed / v_registered, 1) ELSE 0 END,
    'summer_conversion', CASE WHEN v_passed > 0
      THEN ROUND(100.0 * v_summer / v_passed, 1) ELSE 0 END,
    'class_conversion', CASE WHEN v_passed > 0
      THEN ROUND(100.0 * v_class / v_passed, 1) ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_attendance_by_instructor(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attendance_by_instructor(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_scan_vs_attendance(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scan_vs_attendance(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_revenue_by_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_season(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_assessment_conversion_funnel(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assessment_conversion_funnel(date, date) TO authenticated;

SELECT 'Analytics v2 migration complete' AS status;
