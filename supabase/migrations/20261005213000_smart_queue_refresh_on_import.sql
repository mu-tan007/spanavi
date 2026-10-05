-- 新しいリストの企業がスマートキュー（mv_smart_queue_base）に出るまで最大15分かかっていた（2026-10-05 むー様指示で改善）。
-- call_list_items に企業が追加されたら「更新の依頼」を残し、1分ごとの見回りで、追加が30秒止んでいれば更新する。
-- 15分ごとの定期更新（cron job 24）はそのまま残す。依頼が無い回は何もしない（表を1行読むだけ）。
set lock_timeout = '5s';

create table if not exists public.mv_refresh_request (
  mv_name      text primary key,
  requested_at timestamptz not null default now()
);
alter table public.mv_refresh_request enable row level security;  -- 画面からは触らない（関数と cron だけ）

create or replace function public.request_smart_queue_refresh()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.mv_refresh_request(mv_name, requested_at) values ('mv_smart_queue_base', now())
  on conflict (mv_name) do update set requested_at = excluded.requested_at;
  return null;
end;
$function$;

-- 文単位（1回の取り込みで1回だけ動く）
drop trigger if exists trg_request_smart_queue_refresh on public.call_list_items;
create trigger trg_request_smart_queue_refresh
  after insert on public.call_list_items
  for each statement execute function public.request_smart_queue_refresh();

create or replace function public.refresh_smart_queue_if_requested()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '5min'
as $function$
declare
  v_req  timestamptz;
  v_last timestamptz;
begin
  select requested_at into v_req from public.mv_refresh_request where mv_name = 'mv_smart_queue_base';
  if v_req is null or v_req > now() - interval '30 seconds' then
    return;  -- 依頼なし、または取り込みがまだ続いている
  end if;
  select refreshed_at into v_last from public.mv_refresh_log where mv_name = 'mv_smart_queue_base';
  if v_last is not null and v_last >= v_req then
    return;  -- 依頼の後にもう更新済み
  end if;
  perform public._refresh_mv_guarded('mv_smart_queue_base');  -- 3分以内に更新済みなら何もせず、次の回でもう一度試す
end;
$function$;

select cron.unschedule(jobid) from cron.job where jobname = 'smart-queue-refresh-on-import';
select cron.schedule('smart-queue-refresh-on-import', '* * * * *',
  $$SET statement_timeout='5min'; SELECT public.refresh_smart_queue_if_requested();$$);
