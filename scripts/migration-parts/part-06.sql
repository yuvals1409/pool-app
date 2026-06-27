-- ── 6. get_marketing_funnel ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_marketing_funnel(
  p_from date,
  p_to date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leads integer;
  v_assessed integer;
  v_passed integer;
  v_enrolled integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN '{}'::json;
  END IF;

  SELECT COUNT(*)::int INTO v_leads
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.status IN ('new', 'call', 'registered_assessment');

  SELECT COUNT(*)::int INTO v_assessed
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.status = 'registered_assessment';

  SELECT COUNT(*)::int INTO v_passed
  FROM assessment_leads al
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND al.assessment_result = 'passed';

  SELECT COUNT(DISTINCT al.participant_id)::int INTO v_enrolled
  FROM assessment_leads al
  JOIN enrollments e ON e.participant_id = al.participant_id AND e.active = TRUE
  JOIN products p ON p.id = e.product_id
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE al.created_at::date BETWEEN p_from AND p_to
    AND pt.code = 'annual_section';

  RETURN json_build_object(
    'from', p_from,
    'to', p_to,
    'leads', v_leads,
    'assessed', v_assessed,
    'passed', v_passed,
    'enrolled_annual', v_enrolled,
    'conversion_assessed', CASE WHEN v_leads > 0 THEN ROUND(100.0 * v_assessed / v_leads, 1) ELSE 0 END,
    'conversion_enrolled', CASE WHEN v_assessed > 0 THEN ROUND(100.0 * v_enrolled / v_assessed, 1) ELSE 0 END,
    'by_source', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.cnt DESC)
      FROM (
        SELECT al.source, COUNT(*)::int AS cnt
        FROM assessment_leads al
        WHERE al.created_at::date BETWEEN p_from AND p_to
        GROUP BY al.source
      ) t
    ), '[]'::json)
  );
END;
$$;

