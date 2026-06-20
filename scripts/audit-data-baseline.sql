-- ============================================================
--  Data baseline audit — Command Center (שלב 0)
--  הרץ ב-Supabase SQL Editor (read-only)
-- ============================================================

-- ── Participants ────────────────────────────────────────────
SELECT 'participants_total' AS metric, COUNT(*)::int AS value FROM participants;

SELECT 'participants_missing_gender' AS metric, COUNT(*)::int AS value
FROM participants WHERE gender IS NULL OR trim(gender) = '';

SELECT 'participants_missing_birth_date' AS metric, COUNT(*)::int AS value
FROM participants WHERE birth_date IS NULL;

SELECT 'participants_missing_grade' AS metric, COUNT(*)::int AS value
FROM participants WHERE grade IS NULL OR trim(grade) = '';

SELECT 'participants_missing_first_enrolled_at' AS metric, COUNT(*)::int AS value
FROM participants WHERE first_enrolled_at IS NULL;

-- ── Enrollments ─────────────────────────────────────────────
SELECT 'active_enrollments' AS metric, COUNT(*)::int AS value
FROM enrollments WHERE active = TRUE;

SELECT 'cancelled_enrollments_missing_cancelled_at' AS metric, COUNT(*)::int AS value
FROM enrollments WHERE active = FALSE AND cancelled_at IS NULL;

-- ── Products & pricing ──────────────────────────────────────
SELECT
  pt.code AS template_code,
  COUNT(*)::int AS products_without_price
FROM products p
JOIN product_templates pt ON pt.id = p.template_id
WHERE p.price IS NULL
  AND EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.product_id = p.id AND e.active = TRUE
  )
GROUP BY pt.code
ORDER BY pt.code;

-- ── Private lessons ───────────────────────────────────────────
SELECT 'lessons_upcoming_unpaid' AS metric, COUNT(*)::int AS value
FROM lessons
WHERE NOT cancelled
  AND lesson_date >= CURRENT_DATE
  AND COALESCE(payment_status, 'unpaid') = 'unpaid';

SELECT 'lessons_missing_price' AS metric, COUNT(*)::int AS value
FROM lessons
WHERE NOT cancelled
  AND lesson_date >= CURRENT_DATE
  AND price IS NULL;

-- ── Instructors ─────────────────────────────────────────────
SELECT 'instructors_missing_hired_at' AS metric, COUNT(*)::int AS value
FROM profiles
WHERE role = 'instructor' AND status = 'approved' AND hired_at IS NULL;

-- ── Lead sources distribution ─────────────────────────────────
SELECT source, COUNT(*)::int AS cnt
FROM assessment_leads
GROUP BY source
ORDER BY cnt DESC;
