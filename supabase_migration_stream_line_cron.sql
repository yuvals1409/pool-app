-- Schedule weekly session + pass generation (Sundays 06:00 UTC)
DO $cron$
DECLARE
  jid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'stream_line_weekly_sessions'
    LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;

    PERFORM cron.schedule(
      'stream_line_weekly_sessions',
      '0 6 * * 0',
      $job$
        SELECT public.generate_weekly_sessions(CURRENT_DATE, CURRENT_DATE + 7);
        SELECT public.generate_access_passes(CURRENT_DATE, CURRENT_DATE + 7);
      $job$
    );
  END IF;
END;
$cron$;
