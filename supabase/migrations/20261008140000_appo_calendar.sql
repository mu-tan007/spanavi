-- アポを apochousei@ma-sp.co の Google カレンダーへ自動で登録する（2026-10-08 むー様）
-- appo-calendar 関数が数分おきに、報告を送ったアポの予定を作る・直す・消す。
alter table public.appointments
  add column if not exists apo_cal_event_id text,
  add column if not exists apo_cal_hash text,
  add column if not exists apo_cal_error text,
  add column if not exists apo_cal_synced_at timestamptz;

-- 動かす・止めるの切り替えと、導入日（これより前に送った報告は、むー様が手で登録済みなので触らない）
create table if not exists public.appo_calendar_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  since timestamptz not null default now()
);
alter table public.appo_calendar_settings enable row level security;
revoke all on public.appo_calendar_settings from anon, authenticated;
insert into public.appo_calendar_settings (id) values (1) on conflict do nothing;

insert into public.internal_cron_tokens (name) values ('appo-calendar') on conflict do nothing;
insert into public.google_oauth_tokens (name) values ('apochousei_calendar') on conflict do nothing;

select cron.unschedule('appo-calendar') where exists (select 1 from cron.job where jobname = 'appo-calendar');
select cron.schedule(
  'appo-calendar',
  '*/3 * * * *',
  $$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/appo-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select token from public.internal_cron_tokens where name = 'appo-calendar')
    ),
    body := '{"mode":"sync"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
