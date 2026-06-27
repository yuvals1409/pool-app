-- ── 10. generate_operational_alerts ───────────────────────────
CREATE OR REPLACE FUNCTION public.generate_operational_alerts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_rec record;
BEGIN
  IF NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  FOR v_rec IN
    WITH ordered AS (
      SELECT
        ae.enrollment_id,
        ae.participant_id,
        COALESCE(ss.session_date, l.lesson_date) AS session_date,
        ae.status,
        ROW_NUMBER() OVER (
          PARTITION BY ae.enrollment_id
          ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC
        ) AS rn
      FROM attendance_events ae
      LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
      LEFT JOIN lessons l ON l.id = ae.lesson_id
      WHERE ae.status IN ('present', 'absent')
    ),
    streaks AS (
      SELECT enrollment_id, participant_id,
        COUNT(*) FILTER (WHERE status = 'absent') AS consecutive_absences
      FROM ordered
      WHERE rn <= 3
      GROUP BY enrollment_id, participant_id
      HAVING COUNT(*) = 3 AND COUNT(*) FILTER (WHERE status = 'absent') = 3
    )
    SELECT
      s.enrollment_id,
      s.participant_id,
      p.full_name AS child_name
    FROM streaks s
    JOIN participants p ON p.id = s.participant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'consecutive_absences'
        AND oa.entity_type = 'enrollment'
        AND oa.entity_id = s.enrollment_id
        AND oa.acknowledged_at IS NULL
    )
  LOOP
    INSERT INTO operational_alerts (
      alert_type, severity, entity_type, entity_id, title, payload
    ) VALUES (
      'consecutive_absences',
      'warn',
      'enrollment',
      v_rec.enrollment_id,
      '3 היעדרויות ברצף: ' || v_rec.child_name,
      json_build_object('participant_id', v_rec.participant_id)
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'inserted', v_inserted);
END;
$$;

