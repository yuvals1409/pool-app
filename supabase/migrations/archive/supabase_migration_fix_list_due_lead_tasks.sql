-- Fix list_due_lead_tasks: include created_at in subquery for ORDER BY
CREATE OR REPLACE FUNCTION public.list_due_lead_tasks()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(sub) ORDER BY sub.due_date, sub.created_at)
      FROM (
        SELECT
          t.id AS task_id,
          t.title,
          t.due_date,
          t.created_at,
          t.lead_id,
          p.full_name AS child_name,
          f.phone AS parent_phone,
          f.parent_name,
          al.status AS lead_status
        FROM lead_follow_up_tasks t
        JOIN assessment_leads al ON al.id = t.lead_id
        LEFT JOIN participants p ON p.id = al.participant_id
        LEFT JOIN families f ON f.id = p.family_id
        WHERE t.completed_at IS NULL
          AND t.due_date <= CURRENT_DATE
      ) sub
    ),
    '[]'::json
  );
END;
$$;
