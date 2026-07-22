-- mv_company_call_status の定期リフレッシュ。既存の連続実行ガード
-- (_refresh_mv_guarded: 3分デデュープ＋advisory lock＋concurrently) に乗せる。
set local search_path = public, extensions;

create or replace function public.refresh_mv_company_call_status()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public._refresh_mv_guarded('mv_company_call_status');
end;
$$;

-- 15分毎（他MVリフレッシュとオフセットをずらす）。statement_timeout を明示。
select cron.schedule(
  'refresh_mv_company_call_status_15min',
  '11-59/15 * * * *',
  $$ SET statement_timeout='4min'; SELECT public.refresh_mv_company_call_status(); $$
);