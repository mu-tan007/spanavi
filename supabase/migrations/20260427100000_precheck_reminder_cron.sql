-- ============================================================
-- 事前確認リマインダー pg_cron スケジュール
-- ------------------------------------------------------------
-- 平日 10:00 JST（= 01:00 UTC）に notify-precheck-reminder を起動。
-- 翌営業日に面談があり pre_check_status が未完了のアポについて
-- 取得者本人 / チームリーダー / org admin にプッシュ通知。
--
-- 設定（一度だけ実行）:
--   ALTER DATABASE postgres SET app.precheck_reminder_secret = '<長いランダム文字列>';
--   ALTER DATABASE postgres SET app.functions_url = 'https://<project>.supabase.co/functions/v1';
--   SELECT pg_reload_conf();
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.kick_precheck_reminder()
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
  v_secret := current_setting('app.precheck_reminder_secret', true);
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'precheck reminder settings not configured (app.functions_url / app.precheck_reminder_secret)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/notify-precheck-reminder',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-precheck-secret',  v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END;
$$;

-- 既存ジョブがあれば削除して再登録
DO $$
BEGIN
  PERFORM cron.unschedule('precheck-reminder-daily') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'precheck-reminder-daily'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 平日 01:00 UTC = 10:00 JST
SELECT cron.schedule(
  'precheck-reminder-daily',
  '0 1 * * 1-5',
  $$SELECT public.kick_precheck_reminder();$$
);
