-- Zoomユーザー同期を毎朝1回まわす
--
-- 背景（2026-08-21 杉浦さんの件）:
-- 架電画面は members.zoom_user_id を鍵に Zoom Phone の録音を引いて call_records.recording_url に
-- 焼き込むが、IDが未設定だと何も言わずスキップする。sync-zoom-users は管理画面からの手動実行
-- のみだったため、入社から同期までの1,100件超が「録音ゼロ」になった。
-- 新メンバーの追加を待たずにIDが埋まるよう、始業前（7:00 JST）に自動実行する。
--
-- 負荷: Zoom Phone ユーザー約20名ぶんの一覧＋詳細取得で、1回あたり数十リクエスト・数秒。

select cron.schedule(
  'sync-zoom-users-daily',
  '0 22 * * *',   -- UTC 22:00 = JST 07:00
  $cron$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/sync-zoom-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
