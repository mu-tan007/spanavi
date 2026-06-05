-- メルマガ予約配信 pg_cron
--
-- 1分毎に status='scheduled' かつ scheduled_at <= now() のキャンペーンを拾い、
-- send-campaign Edge Function を pg_net で非同期起動する。
-- 1ティックあたり最大5キャンペーンに制限（同時並行で大量起動しない）。
--
-- Authorization は anon key (publishable, クライアント側で公開される) を使用。
-- send-campaign 内部では SUPABASE_SERVICE_ROLE_KEY env var で client 作成し RLS バイパス。
-- ※ Supabase platform 制約で ALTER DATABASE による app.* GUC 設定が拒否されるため、
--    URL と anon key を関数内に直接 hardcode する設計を採用。

set local search_path = public, extensions;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.kick_scheduled_email_campaigns()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_url text := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/send-campaign';
  v_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g';
begin
  for r in
    select id from public.email_campaigns
    where status = 'scheduled'
      and scheduled_at is not null
      and scheduled_at <= now()
    order by scheduled_at asc
    limit 5
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key,
        'apikey', v_key
      ),
      body    := jsonb_build_object('campaign_id', r.id),
      timeout_milliseconds := 60000
    );
  end loop;
end $$;

do $$
begin
  perform cron.unschedule('email-campaigns-scheduled') where exists (
    select 1 from cron.job where jobname = 'email-campaigns-scheduled'
  );
exception when others then null;
end $$;

-- 毎分実行
select cron.schedule(
  'email-campaigns-scheduled',
  '* * * * *',
  $cron$select public.kick_scheduled_email_campaigns();$cron$
);
