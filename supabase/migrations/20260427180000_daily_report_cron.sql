-- Daily Report 平日 18:00 JST cron
-- 設定:
--   ALTER DATABASE postgres SET app.daily_report_secret = '<長いランダム文字列>';
--   ALTER DATABASE postgres SET app.functions_url = 'https://<proj>.supabase.co/functions/v1';
--   SELECT pg_reload_conf();
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.kick_daily_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  v_url    := current_setting('app.functions_url', true);
  v_secret := current_setting('app.daily_report_secret', true);
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'daily report settings not configured (app.functions_url / app.daily_report_secret)';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url || '/generate-daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-daily-report-secret', v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-report-weekday') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'daily-report-weekday'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 平日 09:00 UTC = 18:00 JST
SELECT cron.schedule(
  'daily-report-weekday',
  '0 9 * * 1-5',
  $$SELECT public.kick_daily_report();$$
);
