-- Season planning: clone products, carry-forward enrollments, activate season, QR guards

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'annual'
    CHECK (kind IN ('annual', 'summer'));

DROP POLICY IF EXISTS "admin office insert seasons" ON seasons;
CREATE POLICY "admin office insert seasons"
  ON seasons FOR INSERT
  WITH CHECK (public.is_admin_or_office());

-- ── Product planning key (matches import script) ─────────────
CREATE OR REPLACE FUNCTION public.product_planning_key(
  p_day_of_week integer,
  p_instructor_name text,
  p_start_time time,
  p_end_time time,
  p_name text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT concat_ws('|',
    COALESCE(p_day_of_week::text, ''),
    COALESCE(trim(p_instructor_name), ''),
    to_char(p_start_time, 'HH24:MI:SS'),
    to_char(p_end_time, 'HH24:MI:SS'),
    COALESCE(trim(p_name), '')
  );
$$;

-- ── Suggest next annual season metadata ─────────────────────
CREATE OR REPLACE FUNCTION public.suggest_next_season()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest record;
  v_start date;
  v_end date;
  v_name text;
  v_y1 integer;
  v_y2 integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_latest
  FROM seasons
  WHERE kind = 'annual'
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_latest IS NULL THEN
    v_y1 := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
    IF EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN
      v_start := make_date(v_y1, 9, 1);
      v_end := make_date(v_y1 + 1, 6, 30);
      v_name := v_y1::text || '/' || right((v_y1 + 1)::text, 2);
    ELSE
      v_start := make_date(v_y1 - 1, 9, 1);
      v_end := make_date(v_y1, 6, 30);
      v_name := (v_y1 - 1)::text || '/' || right(v_y1::text, 2);
    END IF;
  ELSE
    v_start := (v_latest.start_date + interval '1 year')::date;
    v_end := (v_latest.end_date + interval '1 year')::date;
    v_y1 := EXTRACT(YEAR FROM v_start)::integer;
    v_y2 := EXTRACT(YEAR FROM v_end)::integer;
    v_name := v_y1::text || '/' || right(v_y2::text, 2);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'name', v_name,
    'start_date', v_start,
    'end_date', v_end,
    'kind', 'annual'
  );
END;
$$;

-- ── Create planning season ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_planning_season(
  p_name text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_kind text DEFAULT 'annual'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suggest json;
  v_name text;
  v_start date;
  v_end date;
  v_kind text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  v_suggest := public.suggest_next_season();
  IF (v_suggest->>'result') <> 'ok' THEN
    RETURN v_suggest;
  END IF;

  v_name := COALESCE(NULLIF(trim(p_name), ''), v_suggest->>'name');
  v_start := COALESCE(p_start_date, (v_suggest->>'start_date')::date);
  v_end := COALESCE(p_end_date, (v_suggest->>'end_date')::date);
  v_kind := COALESCE(NULLIF(trim(p_kind), ''), 'annual');

  IF EXISTS (SELECT 1 FROM seasons WHERE name = v_name) THEN
    RETURN json_build_object('result', 'duplicate_name', 'name', v_name);
  END IF;

  INSERT INTO seasons (name, start_date, end_date, active, kind)
  VALUES (v_name, v_start, v_end, false, v_kind)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'result', 'ok',
    'season_id', v_id,
    'name', v_name,
    'start_date', v_start,
    'end_date', v_end,
    'kind', v_kind
  );
END;
$$;

-- ── Clone annual products between seasons ────────────────────
CREATE OR REPLACE FUNCTION public.clone_season_products(
  p_source_season_id uuid,
  p_target_season_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped integer := 0;
  r record;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM seasons WHERE id = p_source_season_id) THEN
    RETURN json_build_object('result', 'source_not_found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM seasons WHERE id = p_target_season_id) THEN
    RETURN json_build_object('result', 'target_not_found');
  END IF;

  FOR r IN
    SELECT p.*
    FROM products p
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE p.season_id = p_source_season_id
      AND pt.code = 'annual_section'
    ORDER BY p.name, p.day_of_week, p.start_time
  LOOP
    IF EXISTS (
      SELECT 1
      FROM products tp
      JOIN product_templates tpt ON tpt.id = tp.template_id
      WHERE tp.season_id = p_target_season_id
        AND tpt.code = 'annual_section'
        AND public.product_planning_key(
          tp.day_of_week, tp.instructor_name, tp.start_time, tp.end_time, tp.name
        ) = public.product_planning_key(
          r.day_of_week, r.instructor_name, r.start_time, r.end_time, r.name
        )
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO products (
      season_id, template_id, name, day_of_week, start_time, end_time,
      instructor_name, instructor_id, capacity, level, level_label,
      target_audience, gender, schedule_pattern, price
    ) VALUES (
      p_target_season_id, r.template_id, r.name, r.day_of_week, r.start_time, r.end_time,
      r.instructor_name, r.instructor_id, r.capacity, r.level, r.level_label,
      r.target_audience, r.gender, r.schedule_pattern, r.price
    )
    RETURNING id INTO v_new_id;

    v_created := v_created + 1;
  END LOOP;

  RETURN json_build_object(
    'result', 'ok',
    'created', v_created,
    'skipped', v_skipped
  );
END;
$$;

-- ── Resolve source season for planning (active annual) ─────────
CREATE OR REPLACE FUNCTION public.resolve_planning_source_season(p_target_season_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.id
      FROM seasons s
      WHERE s.active = TRUE AND s.kind = 'annual'
      ORDER BY s.start_date DESC
      LIMIT 1
    ),
    (
      SELECT s.id
      FROM seasons s
      WHERE s.id <> p_target_season_id
        AND s.kind = 'annual'
        AND s.start_date < (SELECT start_date FROM seasons WHERE id = p_target_season_id)
      ORDER BY s.start_date DESC
      LIMIT 1
    )
  );
$$;

-- ── Carry forward enrollments ────────────────────────────────
CREATE OR REPLACE FUNCTION public.carry_forward_enrollments(
  p_source_season_id uuid,
  p_target_season_id uuid,
  p_dry_run boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer := 0;
  v_skipped_duplicate integer := 0;
  v_unmatched integer := 0;
  v_dual_slot integer := 0;
  v_target_start date;
  v_target_end date;
  r record;
  v_target_product_id uuid;
  v_unmatched_rows jsonb := '[]'::jsonb;
  v_would_create jsonb := '[]'::jsonb;
  v_participant_planned integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT start_date, end_date INTO v_target_start, v_target_end
  FROM seasons WHERE id = p_target_season_id;

  IF v_target_start IS NULL THEN
    RETURN json_build_object('result', 'target_not_found');
  END IF;

  IF p_source_season_id IS NULL THEN
    p_source_season_id := public.resolve_planning_source_season(p_target_season_id);
  END IF;

  IF p_source_season_id IS NULL THEN
    RETURN json_build_object('result', 'source_not_found');
  END IF;

  FOR r IN
    SELECT
      e.id AS enrollment_id,
      e.participant_id,
      p.full_name AS participant_name,
      sp.id AS source_product_id,
      sp.day_of_week,
      sp.instructor_name,
      sp.start_time,
      sp.end_time,
      sp.name AS product_name,
      public.product_planning_key(
        sp.day_of_week, sp.instructor_name, sp.start_time, sp.end_time, sp.name
      ) AS pkey
    FROM enrollments e
    JOIN products sp ON sp.id = e.product_id
    JOIN product_templates spt ON spt.id = sp.template_id
    JOIN participants p ON p.id = e.participant_id
    WHERE sp.season_id = p_source_season_id
      AND e.active = TRUE
      AND spt.code = 'annual_section'
    ORDER BY p.full_name, sp.day_of_week, sp.start_time
  LOOP
    SELECT tp.id INTO v_target_product_id
    FROM products tp
    JOIN product_templates tpt ON tpt.id = tp.template_id
    WHERE tp.season_id = p_target_season_id
      AND tpt.code = 'annual_section'
      AND public.product_planning_key(
        tp.day_of_week, tp.instructor_name, tp.start_time, tp.end_time, tp.name
      ) = r.pkey
    LIMIT 1;

    IF v_target_product_id IS NULL THEN
      v_unmatched := v_unmatched + 1;
      v_unmatched_rows := v_unmatched_rows || jsonb_build_array(jsonb_build_object(
        'participant_id', r.participant_id,
        'participant_name', r.participant_name,
        'source_product_id', r.source_product_id,
        'source_product_name', r.product_name,
        'reason', 'no_matching_product'
      ));
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM enrollments
      WHERE participant_id = r.participant_id
        AND product_id = v_target_product_id
        AND active = TRUE
    ) THEN
      v_skipped_duplicate := v_skipped_duplicate + 1;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_created := v_created + 1;
      v_would_create := v_would_create || jsonb_build_array(jsonb_build_object(
        'participant_id', r.participant_id,
        'participant_name', r.participant_name,
        'target_product_id', v_target_product_id,
        'source_product_name', r.product_name
      ));
      CONTINUE;
    END IF;

    INSERT INTO enrollments (
      product_id, participant_id, payment_status, valid_from, valid_until, active
    ) VALUES (
      v_target_product_id, r.participant_id, 'unpaid', v_target_start, v_target_end, TRUE
    );

    v_created := v_created + 1;
  END LOOP;

  SELECT COUNT(*)::integer INTO v_dual_slot
  FROM (
    SELECT e.participant_id
    FROM enrollments e
    JOIN products pr ON pr.id = e.product_id
    WHERE pr.season_id = p_target_season_id
      AND e.active = TRUE
    GROUP BY e.participant_id
    HAVING COUNT(*) > 1
  ) duals;

  SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_participant_planned
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  WHERE pr.season_id = p_target_season_id AND e.active = TRUE;

  RETURN json_build_object(
    'result', 'ok',
    'dry_run', p_dry_run,
    'source_season_id', p_source_season_id,
    'target_season_id', p_target_season_id,
    'created', v_created,
    'skipped_duplicate', v_skipped_duplicate,
    'unmatched', v_unmatched,
    'unmatched_rows', v_unmatched_rows,
    'would_create', CASE WHEN p_dry_run THEN v_would_create ELSE NULL END,
    'dual_slot_participants', COALESCE(v_dual_slot, 0),
    'planned_participants', COALESCE(v_participant_planned, 0)
  );
END;
$$;

-- ── Planning summary KPIs + participant rows ─────────────────
CREATE OR REPLACE FUNCTION public.get_season_planning_summary(
  p_target_season_id uuid,
  p_source_season_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id uuid;
  v_target record;
  v_source record;
  v_active_current integer := 0;
  v_planned integer := 0;
  v_missing integer := 0;
  v_renewal_pct numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  r record;
  v_target_product_id uuid;
  v_planned_product_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_target FROM seasons WHERE id = p_target_season_id;
  IF v_target IS NULL THEN
    RETURN json_build_object('result', 'target_not_found');
  END IF;

  v_source_id := COALESCE(p_source_season_id, public.resolve_planning_source_season(p_target_season_id));
  IF v_source_id IS NOT NULL THEN
    SELECT * INTO v_source FROM seasons WHERE id = v_source_id;
  END IF;

  SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_planned
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE pr.season_id = p_target_season_id
    AND e.active = TRUE
    AND pt.code = 'annual_section';

  IF v_source_id IS NULL OR v_source.id IS NULL THEN
    RETURN json_build_object(
      'result', 'ok',
      'target_season', json_build_object(
        'id', v_target.id,
        'name', v_target.name,
        'start_date', v_target.start_date,
        'end_date', v_target.end_date,
        'active', v_target.active,
        'kind', v_target.kind
      ),
      'source_season', NULL,
      'active_current', 0,
      'planned', v_planned,
      'missing', 0,
      'renewal_pct', 0,
      'rows', '[]'::jsonb
    );
  END IF;

  SELECT COUNT(DISTINCT e.participant_id)::integer INTO v_active_current
  FROM enrollments e
  JOIN products pr ON pr.id = e.product_id
  JOIN product_templates pt ON pt.id = pr.template_id
  WHERE pr.season_id = v_source.id
    AND e.active = TRUE
    AND pt.code = 'annual_section';

  FOR r IN
    SELECT DISTINCT ON (p.id)
      p.id AS participant_id,
      p.full_name AS participant_name,
      sp.name AS current_product_name,
      sp.instructor_name AS current_instructor,
      sp.day_of_week AS current_day,
      sp.start_time AS current_start
    FROM participants p
    JOIN enrollments e ON e.participant_id = p.id AND e.active = TRUE
    JOIN products sp ON sp.id = e.product_id
    JOIN product_templates spt ON spt.id = sp.template_id
    WHERE sp.season_id = v_source.id
      AND spt.code = 'annual_section'
    ORDER BY p.id, sp.day_of_week, sp.start_time
  LOOP
    SELECT e.product_id INTO v_planned_product_id
    FROM enrollments e
    JOIN products tp ON tp.id = e.product_id
    JOIN product_templates tpt ON tpt.id = tp.template_id
    WHERE e.participant_id = r.participant_id
      AND e.active = TRUE
      AND tp.season_id = p_target_season_id
      AND tpt.code = 'annual_section'
    LIMIT 1;

    IF v_planned_product_id IS NOT NULL THEN
      v_status := 'planned';
    ELSE
      v_status := 'missing';
      v_missing := v_missing + 1;
    END IF;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'participant_id', r.participant_id,
      'participant_name', r.participant_name,
      'status', v_status,
      'current_product_name', r.current_product_name,
      'current_instructor', r.current_instructor,
      'current_day', r.current_day,
      'current_start', r.current_start,
      'planned_product_id', v_planned_product_id,
      'planned_product_name', (
        SELECT name FROM products WHERE id = v_planned_product_id
      )
    ));
  END LOOP;

  IF v_active_current > 0 THEN
    v_renewal_pct := ROUND(100.0 * (v_active_current - v_missing) / v_active_current, 1);
  END IF;

  RETURN json_build_object(
    'result', 'ok',
    'target_season', json_build_object(
      'id', v_target.id,
      'name', v_target.name,
      'start_date', v_target.start_date,
      'end_date', v_target.end_date,
      'active', v_target.active,
      'kind', v_target.kind
    ),
    'source_season', CASE WHEN v_source.id IS NULL THEN NULL ELSE json_build_object(
      'id', v_source.id,
      'name', v_source.name,
      'start_date', v_source.start_date,
      'end_date', v_source.end_date,
      'active', v_source.active
    ) END,
    'active_current', v_active_current,
    'planned', v_planned,
    'missing', v_missing,
    'renewal_pct', v_renewal_pct,
    'rows', v_rows
  );
END;
$$;

-- ── Activate season (go-live) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_season(p_season_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season record;
  v_sessions integer;
  v_to date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_office() THEN
    RETURN json_build_object('result', 'forbidden');
  END IF;

  SELECT * INTO v_season FROM seasons WHERE id = p_season_id;
  IF v_season IS NULL THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF v_season.active THEN
    RETURN json_build_object('result', 'already_active', 'season_id', p_season_id);
  END IF;

  UPDATE seasons SET active = FALSE WHERE active = TRUE AND id <> p_season_id;
  UPDATE seasons SET active = TRUE WHERE id = p_season_id;

  v_to := v_season.start_date + 14;
  v_sessions := public.generate_weekly_sessions(v_season.start_date, v_to);

  INSERT INTO sheet_sync_runs (direction, sheet_tab, status, rows_in, finished_at)
  VALUES ('push', 'season_activate:' || v_season.name, 'ok', v_sessions, NOW());

  RETURN json_build_object(
    'result', 'ok',
    'season_id', p_season_id,
    'name', v_season.name,
    'sessions_generated', v_sessions
  );
END;
$$;

-- ── Guard: access passes only for active seasons ─────────────
CREATE OR REPLACE FUNCTION public.generate_access_passes(p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
  r record;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  row_count integer;
BEGIN
  FOR r IN
    SELECT
      sa.session_id,
      sa.enrollment_id,
      sa.participant_id,
      ss.session_date,
      ss.start_time,
      pt.duration_minutes,
      pt.entry_window_before_minutes,
      pt.entry_window_after_minutes
    FROM session_attendees sa
    JOIN scheduled_sessions ss ON ss.id = sa.session_id
    JOIN products p ON p.id = ss.product_id
    JOIN seasons s ON s.id = p.season_id AND s.active = TRUE
    JOIN product_templates pt ON pt.id = p.template_id
    WHERE ss.session_date BETWEEN p_from AND p_to
      AND ss.status = 'scheduled'
  LOOP
    v_valid_from := (r.session_date + r.start_time)
      - make_interval(mins => r.entry_window_before_minutes);
    v_valid_until := (r.session_date + r.start_time)
      + make_interval(mins => r.duration_minutes + r.entry_window_after_minutes);

    INSERT INTO access_passes (
      session_id, enrollment_id, participant_id, valid_from, valid_until
    ) VALUES (
      r.session_id, r.enrollment_id, r.participant_id, v_valid_from, v_valid_until
    )
    ON CONFLICT (session_id, enrollment_id) DO NOTHING;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    IF row_count > 0 THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_access_pass(p_qr_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_now timestamptz := now();
  v_log_reason text;
BEGIN
  SELECT
    ap.id AS pass_id,
    ap.qr_token,
    ap.status AS pass_status,
    ap.valid_from,
    ap.valid_until,
    ap.used_at,
    ap.session_id,
    ap.enrollment_id,
    ap.participant_id,
    p.full_name AS child_name,
    ss.session_date,
    ss.start_time,
    ss.end_time,
    ss.status AS session_status,
    pr.name AS product_name,
    pr.instructor_name,
    e.payment_status,
    e.active AS enrollment_active,
    s.active AS season_active
  INTO r
  FROM access_passes ap
  JOIN participants p ON p.id = ap.participant_id
  JOIN scheduled_sessions ss ON ss.id = ap.session_id
  JOIN products pr ON pr.id = ss.product_id
  JOIN seasons s ON s.id = pr.season_id
  JOIN enrollments e ON e.id = ap.enrollment_id
  WHERE ap.qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN json_build_object('result', 'not_found');
  END IF;

  IF NOT r.season_active THEN
    RETURN json_build_object('result', 'season_inactive', 'child_name', r.child_name);
  END IF;

  IF r.pass_status = 'used' OR r.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'result', 'already_used',
      'used_at', r.used_at,
      'child_name', r.child_name,
      'session_date', r.session_date,
      'start_time', r.start_time,
      'product_name', r.product_name,
      'instructor_name', r.instructor_name
    );
  END IF;

  IF r.pass_status = 'cancelled' OR r.session_status = 'cancelled' THEN
    RETURN json_build_object('result', 'cancelled', 'child_name', r.child_name);
  END IF;

  IF NOT r.enrollment_active THEN
    RETURN json_build_object('result', 'inactive', 'child_name', r.child_name);
  END IF;

  IF r.payment_status = 'unpaid' THEN
    RETURN json_build_object(
      'result', 'unpaid',
      'child_name', r.child_name,
      'product_name', r.product_name
    );
  END IF;

  IF v_now < r.valid_from THEN
    RETURN json_build_object(
      'result', 'too_early',
      'valid_from', r.valid_from,
      'child_name', r.child_name
    );
  END IF;

  IF v_now > r.valid_until THEN
    RETURN json_build_object(
      'result', 'too_late',
      'valid_until', r.valid_until,
      'child_name', r.child_name
    );
  END IF;

  IF r.pass_status <> 'active' THEN
    RETURN json_build_object('result', 'expired', 'child_name', r.child_name);
  END IF;

  UPDATE access_passes
  SET status = 'used', used_at = v_now, scanned_by = auth.uid()
  WHERE id = r.pass_id;

  PERFORM public.apply_guard_scan_attendance(
    r.session_id, r.enrollment_id, r.participant_id, r.child_name, r.pass_id, auth.uid()
  );

  v_log_reason := json_build_object(
    'child_name', r.child_name,
    'session_date', r.session_date,
    'start_time', r.start_time,
    'product_name', r.product_name,
    'instructor_name', r.instructor_name
  )::text;

  INSERT INTO access_logs (pass_id, result, reason, scanned_by, scanned_at)
  VALUES (r.pass_id, 'ok', v_log_reason, auth.uid(), v_now);

  RETURN json_build_object(
    'result', 'ok',
    'child_name', r.child_name,
    'session_date', r.session_date,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'product_name', r.product_name,
    'instructor_name', r.instructor_name,
    'payment_status', r.payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.product_planning_key(integer, text, time, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_planning_key(integer, text, time, time, text) TO authenticated;

REVOKE ALL ON FUNCTION public.suggest_next_season() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_next_season() TO authenticated;

REVOKE ALL ON FUNCTION public.create_planning_season(text, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_planning_season(text, date, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.clone_season_products(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_season_products(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_planning_source_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_planning_source_season(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.carry_forward_enrollments(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_forward_enrollments(uuid, uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_season_planning_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_planning_summary(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.activate_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_season(uuid) TO authenticated;

SELECT 'Season planning migration complete' AS status;
