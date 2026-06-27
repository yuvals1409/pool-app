-- ============================================================
--  דמו נווה עוז — הכנת נתונים (יום ראשון 28.06.2026, 15:00)
--  הרץ ב-Supabase SQL Editor או: scripts/demo-prep-neve-oz.mjs
--  סימון ניקוי: external_client_id LIKE 'DEMO-%'
-- ============================================================

-- קבועים (UUIDs קבועים לדמו — idempotent)
-- משפחת לוי (גיבור הדמו)     DEMO-LEVY-FAM
-- נועם לוי (QR)               DEMO-LEVY-NOAM
-- מיכל לוי (לא שולם)          DEMO-LEVY-MICHAL
-- משפחת שמעון (רשימת המתנה)  DEMO-SHM-FAM
-- שיעור יום ראשון לדמו        DEMO-SUN-SESSION

DO $$
DECLARE
  v_season_id uuid := '65714d93-c514-463f-98c6-d2b151bbec9e';
  v_product_id uuid := 'ab6db93a-5863-48f8-af53-eac2d416cbc6'; -- קטנים מתקדמים
  v_waitlist_product uuid := '574c19e5-2314-446a-b986-ca8926f7b668'; -- קטנים מתחילים
  v_family_levy uuid := 'a1000001-0001-4001-8001-000000000001';
  v_noam uuid := 'a1000002-0002-4002-8002-000000000001';
  v_michal uuid := 'a1000003-0003-4003-8003-000000000001';
  v_family_shimon uuid := 'a1000001-0001-4001-8001-000000000002';
  v_shimon_child uuid := 'a1000002-0002-4002-8002-000000000002';
  v_session_id uuid := 'a1000004-0004-4004-8004-000000000001';
  v_enroll_noam uuid;
  v_enroll_michal uuid;
  v_demo_date date := '2026-06-28';
BEGIN
  -- ── משפחת לוי (2 ילדים, CRM) ─────────────────────────────
  INSERT INTO families (id, parent_name, phone, email, is_shareholder)
  VALUES (v_family_levy, 'רונית לוי', '054-555-0101', 'ronit.levy@example.com', false)
  ON CONFLICT (id) DO UPDATE SET
    parent_name = EXCLUDED.parent_name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email;

  INSERT INTO participants (id, family_id, full_name, birth_date, gender, grade, external_client_id)
  VALUES
    (v_noam, v_family_levy, 'נועם לוי', '2017-03-15', 'male', 'ו''', 'DEMO-LEVY-NOAM'),
    (v_michal, v_family_levy, 'מיכל לוי', '2019-08-22', 'female', 'ב''', 'DEMO-LEVY-MICHAL')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    birth_date = EXCLUDED.birth_date,
    gender = EXCLUDED.gender,
    grade = EXCLUDED.grade,
    external_client_id = EXCLUDED.external_client_id;

  -- הרשמות: נועם שילם, מיכל לא
  INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
  VALUES (v_product_id, v_noam, 'paid', '2025-09-01', '2026-09-01', true)
  ON CONFLICT (participant_id, product_id) WHERE active = true
  DO UPDATE SET payment_status = 'paid', valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until
  RETURNING id INTO v_enroll_noam;

  INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
  VALUES (v_product_id, v_michal, 'unpaid', '2025-09-01', '2026-09-01', true)
  ON CONFLICT (participant_id, product_id) WHERE active = true
  DO UPDATE SET payment_status = 'unpaid', valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until
  RETURNING id INTO v_enroll_michal;

  IF v_enroll_noam IS NULL THEN
    SELECT id INTO v_enroll_noam FROM enrollments
    WHERE participant_id = v_noam AND product_id = v_product_id AND active;
  END IF;

  -- ── משפחת שמעון (רשימת המתנה) ────────────────────────────
  INSERT INTO families (id, parent_name, phone, email)
  VALUES (v_family_shimon, 'דנה שמעון', '052-555-0202', 'dana.shimon@example.com')
  ON CONFLICT (id) DO UPDATE SET parent_name = EXCLUDED.parent_name, phone = EXCLUDED.phone;

  INSERT INTO participants (id, family_id, full_name, birth_date, gender, grade, external_client_id)
  VALUES (v_shimon_child, v_family_shimon, 'אור שמעון', '2018-11-05', 'male', 'ד''', 'DEMO-SHM-CHILD')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- קבוצה עם קיבולת להדגמת המתנה
  UPDATE products SET capacity = GREATEST(COALESCE(capacity, 0), 12)
  WHERE id = v_waitlist_product;

  INSERT INTO waitlist_entries (
    family_id, participant_id, target_type, target_id, position, status,
    phone, parent_name, child_name, child_age
  )
  SELECT
    v_family_shimon, v_shimon_child, 'product', v_waitlist_product,
    COALESCE((SELECT max(position) FROM waitlist_entries WHERE target_id = v_waitlist_product), 0) + 1,
    'waiting',
    '052-555-0202', 'דנה שמעון', 'אור שמעון', 7
  WHERE NOT EXISTS (
    SELECT 1 FROM waitlist_entries
    WHERE participant_id = v_shimon_child AND target_id = v_waitlist_product AND status = 'waiting'
  );

  -- ── שיעור יום ראשון לדמו QR (15:30 — חלון כניסה מ-15:00) ──
  INSERT INTO scheduled_sessions (id, product_id, session_date, start_time, end_time, status)
  VALUES (v_session_id, v_product_id, v_demo_date, '15:30', '16:15', 'scheduled')
  ON CONFLICT (id) DO UPDATE SET
    session_date = EXCLUDED.session_date,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    status = 'scheduled';

  IF v_enroll_noam IS NOT NULL THEN
    INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
    VALUES (v_session_id, v_enroll_noam, v_noam)
    ON CONFLICT (session_id, enrollment_id) DO NOTHING;
  END IF;

  -- מחיקת כרטיסי כניסה ישנים לשיעור הדמו (לסריקה חוזרת)
  DELETE FROM access_passes WHERE session_id = v_session_id;

  PERFORM public.generate_access_passes(v_demo_date, v_demo_date);

  -- טוקן פורטל קבוע לכתובת ידועה בדמו
  UPDATE participants
  SET portal_token = 'd1000001-0001-4001-8001-000000000001'::uuid,
      portal_failed_attempts = 0,
      portal_locked_at = NULL
  WHERE id = v_noam;
END $$;

-- ── התראות דמו בלבד (לא נוגעים בנתונים אמיתיים) ───────────
INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
SELECT 'churn_risk', 'warn', 'participant', p.id,
  'סיכון עזיבה: ' || p.full_name,
  json_build_object('participant_id', p.id, 'demo', true)
FROM participants p
WHERE p.external_client_id = 'DEMO-LEVY-MICHAL'
  AND NOT EXISTS (
    SELECT 1 FROM operational_alerts oa
    WHERE oa.alert_type = 'churn_risk' AND oa.entity_id = p.id AND oa.acknowledged_at IS NULL
  );

INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
SELECT 'capacity_full', 'info', 'product', pr.id,
  'קבוצה מלאה: ' || pr.name,
  json_build_object('product_name', pr.name, 'demo', true)
FROM products pr
WHERE pr.id = '574c19e5-2314-446a-b986-ca8926f7b668'
  AND NOT EXISTS (
    SELECT 1 FROM operational_alerts oa
    WHERE oa.alert_type = 'capacity_full' AND oa.entity_id = pr.id AND oa.acknowledged_at IS NULL
  );

INSERT INTO operational_alerts (alert_type, severity, entity_type, entity_id, title, payload)
SELECT 'consecutive_absences', 'warn', 'enrollment', e.id,
  '3 היעדרויות ברצף: ' || p.full_name,
  json_build_object('participant_id', p.id, 'demo', true)
FROM enrollments e
JOIN participants p ON p.id = e.participant_id
WHERE p.external_client_id = 'DEMO-LEVY-MICHAL' AND e.active
  AND NOT EXISTS (
    SELECT 1 FROM operational_alerts oa
    WHERE oa.alert_type = 'consecutive_absences' AND oa.entity_id = e.id AND oa.acknowledged_at IS NULL
  )
LIMIT 1;

-- אופציונלי: מגוון תשלומים במערכת (משנה נתונים אמיתיים — הרץ רק אם מאושר)
-- ראה scripts/demo-prep-neve-oz-polish.sql

-- ── סיכום לבדיקה ───────────────────────────────────────────
SELECT 'families_demo' AS metric, count(*)::text AS value
FROM families f
JOIN participants p ON p.family_id = f.id
WHERE p.external_client_id LIKE 'DEMO-%'
UNION ALL
SELECT 'unpaid_enrollments', count(*)::text FROM enrollments WHERE active AND payment_status = 'unpaid'
UNION ALL
SELECT 'waitlist_waiting', count(*)::text FROM waitlist_entries WHERE status = 'waiting'
UNION ALL
SELECT 'open_alerts', count(*)::text FROM operational_alerts WHERE acknowledged_at IS NULL
UNION ALL
SELECT 'sunday_session_attendees', count(*)::text
FROM session_attendees sa
JOIN scheduled_sessions ss ON ss.id = sa.session_id
WHERE ss.id = 'a1000004-0004-4004-8004-000000000001';
