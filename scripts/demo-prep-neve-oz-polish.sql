-- ============================================================
--  אופציונלי: ליטוש נתונים אמיתיים לדמו (הרץ רק במודעות!)
--  משנה ~12 הרשמות ל-unpaid ו-3 ל-waived — ניתן לביטול ידני
-- ============================================================

UPDATE enrollments e
SET payment_status = 'unpaid'
FROM participants p
WHERE e.participant_id = p.id
  AND e.active = true
  AND e.payment_status = 'paid'
  AND (p.external_client_id IS NULL OR p.external_client_id NOT LIKE 'DEMO-%')
  AND e.id IN (
    SELECT e2.id FROM enrollments e2
    JOIN participants p2 ON p2.id = e2.participant_id
    WHERE e2.active AND e2.payment_status = 'paid'
      AND (p2.external_client_id IS NULL OR p2.external_client_id NOT LIKE 'DEMO-%')
    ORDER BY random()
    LIMIT 12
  );

UPDATE enrollments SET payment_status = 'waived'
WHERE id IN (
  SELECT id FROM enrollments WHERE active AND payment_status = 'paid'
    AND participant_id NOT IN (SELECT id FROM participants WHERE external_client_id LIKE 'DEMO-%')
  ORDER BY random() LIMIT 3
);

SELECT public.generate_operational_alerts();
