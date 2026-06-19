-- ============================================================
--  MIGRATION: החלפת מדריך חד-פעמית לקבוצות
--  הרץ ב-SQL Editor ב-Supabase (פעם אחת, על DB קיים)
-- ============================================================

-- ── 1. טבלת override ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_instructor_overrides (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_session_id   UUID NOT NULL UNIQUE REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
  instructor_id          UUID NOT NULL REFERENCES profiles(id),
  instructor_name        TEXT NOT NULL,
  original_instructor_id UUID REFERENCES profiles(id),
  reason                 TEXT,
  created_by             UUID REFERENCES profiles(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_instructor_overrides_session
  ON session_instructor_overrides (scheduled_session_id);

CREATE INDEX IF NOT EXISTS idx_session_instructor_overrides_instructor
  ON session_instructor_overrides (instructor_id);

ALTER TABLE session_instructor_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approved read session instructor overrides" ON session_instructor_overrides;
CREATE POLICY "approved read session instructor overrides"
  ON session_instructor_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND status = 'approved'
    )
  );

DROP POLICY IF EXISTS "admins manage session instructor overrides" ON session_instructor_overrides;
CREATE POLICY "admins manage session instructor overrides"
  ON session_instructor_overrides FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 2. helper — מדריך אפקטיבי למפגש ─────────────────────
CREATE OR REPLACE FUNCTION public.effective_session_instructor(p_session_id uuid)
RETURNS TABLE (
  instructor_id uuid,
  instructor_name text,
  is_substitute boolean,
  original_instructor_id uuid,
  original_instructor_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(o.instructor_id, pr.instructor_id) AS instructor_id,
    COALESCE(o.instructor_name, pr.instructor_name) AS instructor_name,
    (o.id IS NOT NULL) AS is_substitute,
    COALESCE(o.original_instructor_id, pr.instructor_id) AS original_instructor_id,
    COALESCE(op.full_name, pr.instructor_name) AS original_instructor_name
  FROM scheduled_sessions ss
  JOIN products pr ON pr.id = ss.product_id
  LEFT JOIN session_instructor_overrides o ON o.scheduled_session_id = ss.id
  LEFT JOIN profiles op ON op.id = COALESCE(o.original_instructor_id, pr.instructor_id)
  WHERE ss.id = p_session_id;
$$;

REVOKE ALL ON FUNCTION public.effective_session_instructor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_session_instructor(uuid) TO authenticated;

-- ── 3. RPC — הגדרה / ביטול החלפה ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_session_instructor_override(
  p_session_id uuid,
  p_substitute_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_substitute record;
  v_effective record;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT
    ss.id,
    ss.status,
    ss.session_date,
    pr.instructor_id AS original_instructor_id,
    pr.instructor_name AS original_instructor_name,
    pt.code AS template_code
  INTO v_session
  FROM scheduled_sessions ss
  JOIN products pr ON pr.id = ss.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE ss.id = p_session_id;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_session.status = 'cancelled' THEN
    RETURN json_build_object('result', 'cancelled');
  END IF;

  IF v_session.template_code = 'swim_assessment' THEN
    RETURN json_build_object('result', 'assessment_not_allowed');
  END IF;

  IF p_substitute_id IS NULL THEN
    DELETE FROM session_instructor_overrides
    WHERE scheduled_session_id = p_session_id;

    SELECT * INTO v_effective
    FROM public.effective_session_instructor(p_session_id);

    RETURN json_build_object(
      'result', 'cleared',
      'instructor_id', v_effective.instructor_id,
      'instructor_name', v_effective.instructor_name,
      'is_substitute', FALSE,
      'original_instructor_id', v_effective.original_instructor_id,
      'original_instructor_name', v_effective.original_instructor_name
    );
  END IF;

  IF p_substitute_id = v_session.original_instructor_id THEN
    DELETE FROM session_instructor_overrides
    WHERE scheduled_session_id = p_session_id;

    RETURN json_build_object(
      'result', 'cleared',
      'instructor_id', v_session.original_instructor_id,
      'instructor_name', v_session.original_instructor_name,
      'is_substitute', FALSE,
      'original_instructor_id', v_session.original_instructor_id,
      'original_instructor_name', v_session.original_instructor_name
    );
  END IF;

  SELECT id, full_name
  INTO v_substitute
  FROM profiles
  WHERE id = p_substitute_id
    AND role = 'instructor'
    AND status = 'approved';

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'invalid_substitute');
  END IF;

  INSERT INTO session_instructor_overrides (
    scheduled_session_id,
    instructor_id,
    instructor_name,
    original_instructor_id,
    reason,
    created_by
  ) VALUES (
    p_session_id,
    v_substitute.id,
    v_substitute.full_name,
    v_session.original_instructor_id,
    NULLIF(trim(p_reason), ''),
    auth.uid()
  )
  ON CONFLICT (scheduled_session_id) DO UPDATE SET
    instructor_id = EXCLUDED.instructor_id,
    instructor_name = EXCLUDED.instructor_name,
    original_instructor_id = EXCLUDED.original_instructor_id,
    reason = EXCLUDED.reason,
    created_by = EXCLUDED.created_by,
    created_at = NOW();

  SELECT * INTO v_effective
  FROM public.effective_session_instructor(p_session_id);

  RETURN json_build_object(
    'result', 'ok',
    'instructor_id', v_effective.instructor_id,
    'instructor_name', v_effective.instructor_name,
    'is_substitute', v_effective.is_substitute,
    'original_instructor_id', v_effective.original_instructor_id,
    'original_instructor_name', v_effective.original_instructor_name,
    'reason', NULLIF(trim(p_reason), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_session_instructor_override(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_session_instructor_override(uuid, uuid, text) TO authenticated;

-- ── 4. עדכון can_mark_session_attendance ───────────────────
CREATE OR REPLACE FUNCTION public.can_mark_session_attendance(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_template text;
  v_instructor_id uuid;
  v_session_date date;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT
    pt.code,
    eff.instructor_id,
    ss.session_date
  INTO v_template, v_instructor_id, v_session_date
  FROM scheduled_sessions ss
  JOIN products pr ON pr.id = ss.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
  WHERE ss.id = p_session_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_template = 'swim_assessment' AND v_session_date = CURRENT_DATE THEN
    RETURN TRUE;
  END IF;

  RETURN v_instructor_id = auth.uid();
END;
$$;

-- ── 5. עדכון list_instructor_sessions ──────────────────────
CREATE OR REPLACE FUNCTION public.list_instructor_sessions(p_date date DEFAULT CURRENT_DATE)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.start_time, t.title), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      'group'::text AS session_type,
      ss.id AS session_id,
      ss.id AS scheduled_session_id,
      NULL::uuid AS lesson_id,
      pr.name AS title,
      pt.code AS template_code,
      ss.session_date,
      ss.start_time,
      ss.end_time,
      COUNT(sa.id)::int AS expected_count,
      COUNT(sa.id) FILTER (
        WHERE sa.attendance_status IN ('present', 'absent', 'excused', 'late')
      )::int AS marked_count
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
    LEFT JOIN session_attendees sa ON sa.session_id = ss.id
    WHERE ss.session_date = p_date
      AND ss.status <> 'cancelled'
      AND (
        public.is_admin()
        OR (pt.code = 'swim_assessment' AND p_date = CURRENT_DATE)
        OR eff.instructor_id = v_uid
      )
    GROUP BY ss.id, pr.name, pt.code, ss.session_date, ss.start_time, ss.end_time

    UNION ALL

    SELECT
      'private'::text AS session_type,
      l.id AS session_id,
      NULL::uuid AS scheduled_session_id,
      l.id AS lesson_id,
      l.child_name AS title,
      'private_lesson'::text AS template_code,
      l.lesson_date AS session_date,
      l.start_time,
      l.end_time,
      1 AS expected_count,
      CASE WHEN l.attendance_status IN ('present', 'absent', 'excused', 'late') THEN 1 ELSE 0 END AS marked_count
    FROM lessons l
    WHERE l.lesson_date = p_date
      AND NOT l.cancelled
      AND (public.is_admin() OR l.instructor_id = v_uid)
  ) t;

  RETURN v_rows;
END;
$$;

-- ── 6. עדכון get_instructor_work_sessions (שכר למחליף) ───
CREATE OR REPLACE FUNCTION public.get_instructor_work_sessions(
  p_from date,
  p_to date,
  p_instructor_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_rows json;
BEGIN
  IF NOT public.is_instructor_or_admin() THEN
    RETURN '[]'::json;
  END IF;

  IF public.is_admin() THEN
    v_target := p_instructor_id;
  ELSE
    v_target := v_uid;
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.session_date, t.start_time, t.title), '[]'::json)
  INTO v_rows
  FROM (
  SELECT
    w.instructor_id,
    p.full_name AS instructor_name,
    w.session_type,
    w.session_id,
    w.lesson_id,
    w.scheduled_session_id,
    w.session_date,
    w.start_time,
    w.title,
    w.template_code,
    w.duration_minutes,
    ROUND(w.duration_minutes / 60.0, 2) AS duration_hours,
    w.marked_at,
    ipr.rate_per_hour AS pay_rate,
    CASE
      WHEN ipr.rate_per_hour IS NOT NULL
      THEN ROUND((w.duration_minutes / 60.0) * ipr.rate_per_hour, 2)
      ELSE NULL
    END AS pay_amount
  FROM (
    SELECT
      eff.instructor_id,
      'group'::text AS session_type,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      ss.id AS scheduled_session_id,
      ss.session_date,
      ss.start_time,
      pr.name AS title,
      pt.code AS template_code,
      public.resolve_session_duration_minutes(pt.code, ss.start_time, ss.end_time) AS duration_minutes,
      MAX(sa.attendance_marked_at) AS marked_at
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
    JOIN session_attendees sa ON sa.session_id = ss.id
    WHERE ss.status <> 'cancelled'
      AND pt.code <> 'swim_assessment'
      AND eff.instructor_id IS NOT NULL
      AND sa.attendance_status IN ('present', 'absent', 'excused', 'late')
      AND ss.session_date BETWEEN p_from AND p_to
    GROUP BY ss.id, eff.instructor_id, pr.name, pt.code, ss.session_date, ss.start_time, ss.end_time

    UNION ALL

    SELECT
      l.instructor_id,
      'private'::text AS session_type,
      l.id AS session_id,
      l.id AS lesson_id,
      NULL::uuid AS scheduled_session_id,
      l.lesson_date AS session_date,
      l.start_time,
      l.child_name AS title,
      'private_lesson'::text AS template_code,
      public.resolve_session_duration_minutes('private_lesson', l.start_time, l.end_time) AS duration_minutes,
      l.attendance_marked_at AS marked_at
    FROM lessons l
    WHERE NOT l.cancelled
      AND l.instructor_id IS NOT NULL
      AND l.attendance_status IN ('present', 'absent', 'excused', 'late')
      AND l.lesson_date BETWEEN p_from AND p_to

    UNION ALL

    SELECT
      marker.instructor_id,
      'group'::text AS session_type,
      ss.id AS session_id,
      NULL::uuid AS lesson_id,
      ss.id AS scheduled_session_id,
      ss.session_date,
      ss.start_time,
      COALESCE(pr.name, 'מבדק') AS title,
      'swim_assessment'::text AS template_code,
      public.resolve_session_duration_minutes('swim_assessment', ss.start_time, ss.end_time) AS duration_minutes,
      marker.marked_at
    FROM scheduled_sessions ss
    JOIN products pr ON pr.id = ss.product_id
    JOIN product_templates pt ON pt.id = pr.template_id
    JOIN LATERAL (
      SELECT
        sa.attendance_marked_by AS instructor_id,
        MAX(sa.attendance_marked_at) AS marked_at
      FROM session_attendees sa
      WHERE sa.session_id = ss.id
        AND sa.attendance_status IN ('present', 'absent', 'excused', 'late')
        AND sa.attendance_marked_by IS NOT NULL
      GROUP BY sa.attendance_marked_by
      ORDER BY COUNT(*) DESC, MAX(sa.attendance_marked_at) DESC
      LIMIT 1
    ) marker ON true
    WHERE ss.status <> 'cancelled'
      AND pt.code = 'swim_assessment'
      AND ss.session_date BETWEEN p_from AND p_to
  ) w
  JOIN profiles p ON p.id = w.instructor_id
  LEFT JOIN instructor_pay_rates ipr
    ON ipr.instructor_id = w.instructor_id
   AND ipr.template_code = w.template_code
  WHERE v_target IS NULL OR w.instructor_id = v_target
  ) t;

  RETURN v_rows;
END;
$$;

-- ── 7. RLS session_attendees — מחליף יכול לסמן נוכחות ────
DROP POLICY IF EXISTS "instructor update session attendees attendance" ON session_attendees;
CREATE POLICY "instructor update session attendees attendance"
  ON session_attendees FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM scheduled_sessions ss
      JOIN products pr ON pr.id = ss.product_id
      JOIN product_templates pt ON pt.id = pr.template_id
      CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
      WHERE ss.id = session_attendees.session_id
        AND (
          eff.instructor_id = auth.uid()
          OR (pt.code = 'swim_assessment' AND ss.session_date = CURRENT_DATE)
        )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM scheduled_sessions ss
      JOIN products pr ON pr.id = ss.product_id
      JOIN product_templates pt ON pt.id = pr.template_id
      CROSS JOIN LATERAL public.effective_session_instructor(ss.id) eff
      WHERE ss.id = session_attendees.session_id
        AND (
          eff.instructor_id = auth.uid()
          OR (pt.code = 'swim_assessment' AND ss.session_date = CURRENT_DATE)
        )
    )
  );

SELECT 'session instructor overrides migration complete ✓' AS status;
