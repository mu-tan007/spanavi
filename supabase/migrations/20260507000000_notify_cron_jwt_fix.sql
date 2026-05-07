-- ============================================================
-- Notify系 pg_cron の Authorization JWT 修正 (2026-05-07)
-- ------------------------------------------------------------
-- これまで Studio で直接登録されていた以下3本の pg_cron が
-- Authorization ヘッダーにJWTのヘッダー部分のみ
-- ('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9') を渡しており、
-- Edge Function 側で verify_jwt が有効な場合に
-- 401 UNAUTHORIZED_INVALID_JWT_FORMAT となっていた。
--
-- 2026-05-02 の notify-pre-check 再デプロイで JWT 検証が効くように
-- なった瞬間から、5/2〜5/6 の事前確認 Slack 通知が無言で抹けていた。
-- notify-ranking 系は verify_jwt=false で動いていたが、同じパターン
-- なので予防的に anon key の正しい JWT に差し替える。
--
-- 本 migration は idempotent。anon key はクライアントバンドルに
-- 含まれる公開キーなので直書きで問題なし。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ------------------------------------------------------------
-- 既存の壊れた cron を unschedule（あれば）
-- ------------------------------------------------------------
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobname FROM cron.job
    WHERE jobname IN ('notify-pre-check-daily', 'notify-ranking-half', 'notify-ranking-hourly')
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 1) notify-pre-check-daily: 毎朝 05:00 JST (= 20:00 UTC)
--    当日・1営業日後・2営業日後のアポを Slack #事前確認 に通知
-- ------------------------------------------------------------
SELECT cron.schedule(
  'notify-pre-check-daily',
  '0 20 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/notify-pre-check',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g"}'::jsonb,
    body := '{}'::jsonb
  )
  $cron$
);

-- ------------------------------------------------------------
-- 2) notify-ranking-half: 平日 10:30 / 13:30 / 16:30 JST
--    (= 01:30 / 04:30 / 07:30 UTC)
-- ------------------------------------------------------------
SELECT cron.schedule(
  'notify-ranking-half',
  '30 1,4,7 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/notify-ranking',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g"}'::jsonb,
    body := '{}'::jsonb
  )
  $cron$
);

-- ------------------------------------------------------------
-- 3) notify-ranking-hourly: 平日 09:00 / 12:00 / 15:00 / 18:00 JST
--    (= 00:00 / 03:00 / 06:00 / 09:00 UTC)
-- ------------------------------------------------------------
SELECT cron.schedule(
  'notify-ranking-hourly',
  '0 0,3,6,9 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/notify-ranking',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g"}'::jsonb,
    body := '{}'::jsonb
  )
  $cron$
);
