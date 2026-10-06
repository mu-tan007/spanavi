-- 顧客管理の「最後のやり取り」を Gmail・Slack から1時間ごとに新しくする（2026-10-06）
-- last_contact_ref：どのメール・投稿から取ったか（同じものを二度要約しないため）
alter table public.clients add column if not exists last_contact_ref text;

-- 朝7時〜夜23時（日本時間）の毎時15分に動かす
select cron.schedule(
  'client-last-contact',
  '15 22,23,0-14 * * *',
  $$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/client-last-contact',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
  $$
);
