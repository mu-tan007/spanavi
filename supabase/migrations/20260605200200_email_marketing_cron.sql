-- メルマガ予約配信 pg_cron
--
-- 前提:
--   ALTER DATABASE postgres SET app.functions_url = 'https://<proj>.supabase.co/functions/v1';
--   ALTER DATABASE postgres SET app.service_role_key = '<service_role_jwt>';
--   SELECT pg_reload_conf();
--
-- 1分毎に status='scheduled' かつ scheduled_at <= now() のキャンペーンを拾い、
-- send-campaign Edge Function を pg_net で非同期起動する。
-- 1ティックあたり最大5キャンペーンに制限（同時並行で大量起動しない）。

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
  v_url    text;
  v_key    text;
  r        record;
begin
  v_url := current_setting('app.functions_url', true);
  v_key := current_setting('app.service_role_key', true);
  if v_url is null or v_key is null then
    raise warning 'email cron settings not configured (app.functions_url / app.service_role_key)';
    return;
  end if;

  for r in
    select id from public.email_campaigns
    where status = 'scheduled'
      and scheduled_at is not null
      and scheduled_at <= now()
    order by scheduled_at asc
    limit 5
  loop
    perform net.http_post(
      url     := v_url || '/send-campaign',
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
  $$select public.kick_scheduled_email_campaigns();$$
);
