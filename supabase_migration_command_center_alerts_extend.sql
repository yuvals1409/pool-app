-- Command Center — extend operational alerts (churn + capacity) + daily cron

CREATE OR REPLACE FUNCTION public.generate_operational_alerts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_rec record;
  v_next_season_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT id INTO v_next_season_id
  FROM seasons
  WHERE start_date > COALESCE(
    (SELECT start_date FROM seasons WHERE active = TRUE ORDER BY start_date DESC LIMIT 1),
    CURRENT_DATE
  )
  ORDER BY start_date ASC
  LIMIT 1;

  -- 1. Consecutive absences (3 in a row)
  FOR v_rec IN
    WITH ordered AS (
      SELECT
        ae.enrollment_id,
        ae.participant_id,
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
      SELECT enrollment_id, participant_id
      FROM ordered
      WHERE rn <= 3
      GROUP BY enrollment_id, participant_id
      HAVING COUNT(*) = 3 AND COUNT(*) FILTER (WHERE status = 'absent') = 3
    )
    SELECT s.enrollment_id, s.participant_id, p.full_name AS child_name
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
    INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
    VALUES (
      'consecutive_absences', 'warn', 'enrollment', v_rec.enrollment_id,
      '3 היעדרויות ברצף: ' || v_rec.child_name,
      json_build_object('participant_id', v_rec.participant_id)
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  -- 2. Churn risk: active enrollment + 2+ absences in last 3 + no next-season enrollment
  IF v_next_season_id IS NOT NULL THEN
    FOR v_rec IN
      WITH ordered AS (
        SELECT
          ae.enrollment_id,
          ae.participant_id,
          ae.status,
          ROW_NUMBER() OVER (
            PARTITION BY ae.enrollment_id
            ORDER BY COALESCE(ss.session_date, l.lesson_date) DESC
          ) AS rn
        FROM attendance_events ae
        JOIN enrollments e ON e.id = ae.enrollment_id AND e.active = TRUE
        LEFT JOIN scheduled_sessions ss ON ss.id = ae.scheduled_session_id
        LEFT JOIN lessons l ON l.id = ae.lesson_id
        WHERE ae.status IN ('present', 'absent')
      ),
      at_risk AS (
        SELECT DISTINCT o.participant_id
        FROM ordered o
        WHERE o.rn <= 3
        GROUP BY o.enrollment_id, o.participant_id
        HAVING COUNT(*) FILTER (WHERE o.status = 'absent') >= 2
      )
      SELECT ar.participant_id, p.full_name AS child_name
      FROM at_risk ar
      JOIN participants p ON p.id = ar.participant_id
      WHERE NOT EXISTS (
        SELECT 1 FROM enrollments e
        JOIN products pr ON pr.id = e.product_id
        WHERE e.participant_id = ar.participant_id
          AND e.active = TRUE
          AND pr.season_id = v_next_season_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM operational_alerts oa
        WHERE oa.alert_type = 'churn_risk'
          AND oa.entity_type = 'participant'
          AND oa.entity_id = ar.participant_id
          AND oa.acknowledged_at IS NULL
      )
    LOOP
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES (
        'churn_risk', 'warn', 'participant', v_rec.participant_id,
        'סיכון עזיבה: ' || v_rec.child_name,
        json_build_object('participant_id', v_rec.participant_id, 'next_season_id', v_next_season_id)
      );
      v_inserted := v_inserted + 1;
    END LOOP;
  END IF;

  -- 3. Capacity full
  FOR v_rec IN
    SELECT pr.id AS product_id, pr.name AS product_name, COUNT(e.id)::int AS enrolled, pr.capacity
    FROM products pr
    JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
    WHERE pr.capacity IS NOT NULL AND pr.capacity > 0
    GROUP BY pr.id, pr.name, pr.capacity
    HAVING COUNT(e.id) >= pr.capacity
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'capacity_full'
        AND oa.entity_type = 'product'
        AND oa.entity_id = v_rec.product_id
        AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES (
        'capacity_full', 'info', 'product', v_rec.product_id,
        'קבוצה מלאה: ' || v_rec.product_name,
        json_build_object('enrolled', v_rec.enrolled, 'capacity', v_rec.capacity)
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- 4. Capacity low (<50%, capacity >= 4)
  FOR v_rec IN
    SELECT pr.id AS product_id, pr.name AS product_name, COUNT(e.id)::int AS enrolled, pr.capacity
    FROM products pr
    LEFT JOIN enrollments e ON e.product_id = pr.id AND e.active = TRUE
    WHERE pr.capacity IS NOT NULL AND pr.capacity >= 4
    GROUP BY pr.id, pr.name, pr.capacity
    HAVING COUNT(e.id)::numeric / pr.capacity < 0.5
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM operational_alerts oa
      WHERE oa.alert_type = 'capacity_low'
        AND oa.entity_type = 'product'
        AND oa.entity_id = v_rec.product_id
        AND oa.acknowledged_at IS NULL
    ) THEN
      INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
      VALUES (
        'capacity_low', 'warn', 'product', v_rec.product_id,
        'תפוסה נמוכה: ' || v_rec.product_name,
        json_build_object('enrolled', v_rec.enrolled, 'capacity', v_rec.capacity)
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('result', 'ok', 'inserted', v_inserted);
END;
$$;

DO $cron$
DECLARE
  jid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'command_center_daily_alerts'
    LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;

    PERFORM cron.schedule(
      'command_center_daily_alerts',
      '0 7 * * *',
      $job$SELECT public.generate_operational_alerts();$job$
    );
  END IF;
END;
$cron$;

SELECT 'Command Center alerts extension complete' AS status;
