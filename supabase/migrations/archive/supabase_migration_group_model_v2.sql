-- ============================================================
--  Stream Line — Group model v2
--  Structured schedule, level, target_audience, gender
-- ============================================================

-- ── 1. products columns ─────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS level INTEGER CHECK (level IS NULL OR level BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS level_label TEXT,
  ADD COLUMN IF NOT EXISTS target_audience TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'mixed'));

-- ── 2. target_audience_options ──────────────────────────────
CREATE TABLE IF NOT EXISTS target_audience_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL CHECK (kind IN ('age', 'grade')),
  label      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE target_audience_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read target_audience_options" ON target_audience_options;
CREATE POLICY "staff read target_audience_options"
  ON target_audience_options FOR SELECT
  USING (public.is_approved_staff());

DROP POLICY IF EXISTS "admin office manage target_audience_options" ON target_audience_options;
CREATE POLICY "admin office manage target_audience_options"
  ON target_audience_options FOR ALL
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

INSERT INTO target_audience_options (kind, label) VALUES
  ('age', 'גילאי 4-5'),
  ('age', 'גילאי 5.5-7'),
  ('age', 'גילאי 6-8'),
  ('grade', 'כיתות א''-ב'''),
  ('grade', 'כיתות ב''-ד'''),
  ('grade', 'כיתות ג''-ה'''),
  ('grade', 'כיתות ה''+')
ON CONFLICT (label) DO NOTHING;

-- ── 3. backfill existing products ───────────────────────────
UPDATE products p
SET
  gender = COALESCE(p.gender, 'mixed'),
  level = COALESCE(
    p.level,
    CASE
      WHEN p.level_label ~ 'רמה\s*(\d+)' THEN (regexp_match(p.level_label, 'רמה\s*(\d+)'))[1]::integer
      ELSE NULL
    END
  ),
  target_audience = COALESCE(
    p.target_audience,
    (
      SELECT g FROM (
        SELECT (regexp_matches(p.name || ' ' || COALESCE(p.level_label, ''), 'כיתות[^)\n]*', 'g'))[1] AS g
      ) x WHERE g IS NOT NULL
      LIMIT 1
    ),
    (
      SELECT a FROM (
        SELECT (regexp_matches(p.name || ' ' || COALESCE(p.level_label, ''), 'גילאי?\s*\d+(?:\.\d+)?\s*[\-–]\s*\d+', 'g'))[1] AS a
      ) x WHERE a IS NOT NULL
      LIMIT 1
    ),
    'גילאי 6-8'
  ),
  schedule_pattern = CASE
    WHEN COALESCE(jsonb_array_length(p.schedule_pattern->'schedule'), 0) > 0 THEN p.schedule_pattern
    WHEN pt.code = 'summer_course' THEN
      jsonb_build_object(
        'type', 'course_series',
        'schedule', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'day', wd::integer,
                'startTime', to_char(p.start_time, 'HH24:MI'),
                'endTime', to_char(p.end_time, 'HH24:MI')
              )
              ORDER BY wd::integer
            )
            FROM jsonb_array_elements_text(COALESCE(p.schedule_pattern->'weekdays', '[]'::jsonb)) AS wd
          ),
          '[]'::jsonb
        ),
        'weekdays', COALESCE(p.schedule_pattern->'weekdays', '[]'::jsonb),
        'course_start', p.schedule_pattern->>'course_start',
        'course_end', p.schedule_pattern->>'course_end'
      )
    WHEN p.day_of_week IS NOT NULL THEN
      jsonb_build_object(
        'type', 'weekly',
        'schedule', jsonb_build_array(
          jsonb_build_object(
            'day', p.day_of_week,
            'startTime', to_char(p.start_time, 'HH24:MI'),
            'endTime', to_char(p.end_time, 'HH24:MI')
          )
        )
      )
    ELSE p.schedule_pattern
  END,
  level_label = CASE
    WHEN p.level IS NOT NULL THEN 'רמה ' || p.level::text
    WHEN p.level_label ~ 'רמה\s*(\d+)' THEN p.level_label
    WHEN (regexp_match(p.level_label, 'רמה\s*(\d+)')) IS NOT NULL THEN 'רמה ' || (regexp_match(p.level_label, 'רמה\s*(\d+)'))[1]
    ELSE p.level_label
  END
FROM product_templates pt
WHERE pt.id = p.template_id;

-- ── 4. generate_course_series_sessions (schedule-aware) ─────
CREATE OR REPLACE FUNCTION public.generate_course_series_sessions(p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product record;
  v_pattern jsonb;
  v_type text;
  v_start date;
  v_end date;
  v_weekdays integer[];
  v_schedule jsonb;
  v_d date;
  v_dow integer;
  v_session_id uuid;
  v_slot_start time;
  v_slot_end time;
  v_inserted_sessions integer := 0;
  v_inserted_attendees integer := 0;
  v_row_count integer;
  v_has_schedule boolean;
BEGIN
  SELECT p.*, pt.code AS template_code
  INTO v_product
  FROM products p
  JOIN product_templates pt ON pt.id = p.template_id
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  v_pattern := public.effective_schedule_pattern(p_product_id);
  v_type := v_pattern->>'type';

  IF v_type IS DISTINCT FROM 'course_series' THEN
    RAISE EXCEPTION 'not_course_series_product';
  END IF;

  v_start := (v_pattern->>'course_start')::date;
  v_end := (v_pattern->>'course_end')::date;

  IF v_start IS NULL OR v_end IS NULL THEN
    RAISE EXCEPTION 'course_dates_missing';
  END IF;

  v_schedule := COALESCE(v_pattern->'schedule', '[]'::jsonb);
  v_has_schedule := jsonb_array_length(v_schedule) > 0;

  SELECT COALESCE(array_agg((value::text)::integer ORDER BY ord), ARRAY[]::integer[])
  INTO v_weekdays
  FROM jsonb_array_elements_text(COALESCE(v_pattern->'weekdays', '[]'::jsonb))
    WITH ORDINALITY AS t(value, ord);

  IF NOT v_has_schedule AND array_length(v_weekdays, 1) IS NULL THEN
    RAISE EXCEPTION 'course_weekdays_missing';
  END IF;

  v_d := v_start;
  WHILE v_d <= v_end LOOP
    v_dow := EXTRACT(DOW FROM v_d)::integer;
    v_slot_start := NULL;
    v_slot_end := NULL;

    IF v_has_schedule THEN
      SELECT (s->>'startTime')::time, (s->>'endTime')::time
      INTO v_slot_start, v_slot_end
      FROM jsonb_array_elements(v_schedule) s
      WHERE (s->>'day')::integer = v_dow
      LIMIT 1;
    END IF;

    IF (v_has_schedule AND v_slot_start IS NOT NULL)
       OR (NOT v_has_schedule AND v_dow = ANY (v_weekdays)) THEN
      INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
      VALUES (
        v_product.id,
        v_d,
        COALESCE(v_slot_start, v_product.start_time),
        COALESCE(v_slot_end, v_product.end_time)
      )
      ON CONFLICT (product_id, session_date, start_time) DO NOTHING
      RETURNING id INTO v_session_id;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count > 0 THEN
        v_inserted_sessions := v_inserted_sessions + 1;
      END IF;

      IF v_session_id IS NULL THEN
        SELECT id INTO v_session_id
        FROM scheduled_sessions
        WHERE product_id = v_product.id
          AND session_date = v_d
          AND start_time = COALESCE(v_slot_start, v_product.start_time);
      END IF;

      INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
      SELECT v_session_id, e.id, e.participant_id
      FROM enrollments e
      WHERE e.product_id = p_product_id
        AND e.active = TRUE
        AND e.valid_from <= v_d
        AND e.valid_until >= v_d
      ON CONFLICT (session_id, enrollment_id) DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_inserted_attendees := v_inserted_attendees + v_row_count;
    END IF;
    v_d := v_d + 1;
  END LOOP;

  RETURN v_inserted_sessions;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_course_series_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_course_series_sessions(uuid) TO authenticated;

-- ── 5. generate_weekly_sessions (schedule-aware) ────────────
CREATE OR REPLACE FUNCTION public.generate_weekly_sessions(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  inserted_count integer := 0;
  r record;
  sess_id uuid;
  row_count integer;
BEGIN
  d := p_from;
  WHILE d <= p_to LOOP
    FOR r IN
      SELECT
        e.id AS enrollment_id,
        e.participant_id,
        p.id AS product_id,
        COALESCE(
          (
            SELECT (s->>'startTime')::time
            FROM jsonb_array_elements(COALESCE(p.schedule_pattern->'schedule', '[]'::jsonb)) s
            WHERE (s->>'day')::integer = EXTRACT(DOW FROM d)::integer
            LIMIT 1
          ),
          p.start_time
        ) AS start_time,
        COALESCE(
          (
            SELECT (s->>'endTime')::time
            FROM jsonb_array_elements(COALESCE(p.schedule_pattern->'schedule', '[]'::jsonb)) s
            WHERE (s->>'day')::integer = EXTRACT(DOW FROM d)::integer
            LIMIT 1
          ),
          p.end_time
        ) AS end_time
      FROM enrollments e
      JOIN products p ON p.id = e.product_id
      JOIN product_templates pt ON pt.id = p.template_id
      WHERE e.active = TRUE
        AND d >= e.valid_from
        AND d <= e.valid_until
        AND pt.schedule_pattern->>'type' = 'weekly'
        AND (
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p.schedule_pattern->'schedule', '[]'::jsonb)) s
            WHERE (s->>'day')::integer = EXTRACT(DOW FROM d)::integer
          )
          OR (
            COALESCE(jsonb_array_length(p.schedule_pattern->'schedule'), 0) = 0
            AND p.day_of_week IS NOT NULL
            AND p.day_of_week = EXTRACT(DOW FROM d)::integer
          )
        )
    LOOP
      sess_id := NULL;
      INSERT INTO scheduled_sessions (product_id, session_date, start_time, end_time)
      VALUES (r.product_id, d, r.start_time, r.end_time)
      ON CONFLICT (product_id, session_date, start_time) DO NOTHING
      RETURNING id INTO sess_id;

      IF sess_id IS NULL THEN
        SELECT id INTO sess_id
        FROM scheduled_sessions
        WHERE product_id = r.product_id
          AND session_date = d
          AND start_time = r.start_time;
      END IF;

      INSERT INTO session_attendees (session_id, enrollment_id, participant_id)
      VALUES (sess_id, r.enrollment_id, r.participant_id)
      ON CONFLICT (session_id, enrollment_id) DO NOTHING;

      GET DIAGNOSTICS row_count = ROW_COUNT;
      IF row_count > 0 THEN
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
    d := d + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_weekly_sessions(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_weekly_sessions(date, date) TO authenticated;

SELECT 'Group model v2 migration complete' AS status;
