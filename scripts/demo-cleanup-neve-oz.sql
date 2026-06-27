-- ============================================================
--  ניקוי נתוני דמו נווה עוז (אחרי הפגישה)
--  מוחק רק רשומות עם external_client_id LIKE 'DEMO-%'
-- ============================================================

DELETE FROM access_passes WHERE participant_id IN (
  SELECT id FROM participants WHERE external_client_id LIKE 'DEMO-%'
);
DELETE FROM attendance_events WHERE participant_id IN (
  SELECT id FROM participants WHERE external_client_id LIKE 'DEMO-%'
);
DELETE FROM session_attendees WHERE participant_id IN (
  SELECT id FROM participants WHERE external_client_id LIKE 'DEMO-%'
);
DELETE FROM waitlist_entries WHERE participant_id IN (
  SELECT id FROM participants WHERE external_client_id LIKE 'DEMO-%'
);
DELETE FROM enrollments WHERE participant_id IN (
  SELECT id FROM participants WHERE external_client_id LIKE 'DEMO-%'
);
DELETE FROM portal_sessions WHERE participant_id IN (
  SELECT id FROM participants WHERE external_client_id LIKE 'DEMO-%'
);
DELETE FROM participants WHERE external_client_id LIKE 'DEMO-%';
DELETE FROM families WHERE id IN (
  'a1000001-0001-4001-8001-000000000001',
  'a1000001-0001-4001-8001-000000000002'
);
DELETE FROM scheduled_sessions WHERE id = 'a1000004-0004-4004-8004-000000000001';
DELETE FROM operational_alerts WHERE (payload->>'demo')::boolean IS TRUE;

SELECT 'demo cleanup done' AS status;
