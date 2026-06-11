set local search_path = public, extensions;

-- ════════════════════════════════════════════════════════════════
-- スマートキュー集計(MV)の連続実行ガード（2026-06-11 IO枯渇インシデント対策）
-- 背景: 1回45〜53秒の全面再構築が、リスト操作のたび+cronで乱発され
--       ディスクIO枯渇の主因になっていた。
-- 方式: 「直近3分以内に更新済みならスキップ」+「同時実行は後着スキップ」
-- 併せて pg_cron に cleanup_cron_job_history (毎日3:00 JST,
-- cron.job_run_details の7日超を削除) を登録済み（本番適用済み）。
-- ════════════════════════════════════════════════════════════════

create table if not exists public.mv_refresh_log (
  mv_name      text primary key,
  refreshed_at timestamptz not null default now()
);
alter table public.mv_refresh_log enable row level security;

create or replace function public._refresh_mv_guarded(p_mv text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_last timestamptz;
begin
  select refreshed_at into v_last from mv_refresh_log where mv_name = p_mv;
  if v_last is not null and v_last > now() - interval '3 minutes' then
    return;
  end if;
  if not pg_try_advisory_xact_lock(hashtext('mv_refresh:' || p_mv)) then
    return;
  end if;
  set local statement_timeout = '3min';
  execute format('refresh materialized view concurrently public.%I', p_mv);
  insert into mv_refresh_log(mv_name, refreshed_at) values (p_mv, now())
  on conflict (mv_name) do update set refreshed_at = now();
end;
$$;

create or replace function public.refresh_mv_smart_queue_base()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public._refresh_mv_guarded('mv_smart_queue_base');
end; $$;

create or replace function public.refresh_mv_latest_call_records()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public._refresh_mv_guarded('mv_latest_call_records');
end; $$;

create or replace function public.refresh_smart_queue_mvs()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform public._refresh_mv_guarded('mv_latest_call_records');
  perform public._refresh_mv_guarded('mv_smart_queue_base');
  perform public._refresh_mv_guarded('mv_industry_time_score');
end; $$;
