-- =====================================================================
-- refresh_smart_queue_mvs に mv_industry_time_score を追加
-- 業種別キーマン接続率データが pg_cron 5分おき refresh の対象外で、
-- 新規架電が反映されない問題を解消
-- =====================================================================

set local search_path = public, extensions;

create or replace function public.refresh_smart_queue_mvs()
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  refresh materialized view concurrently public.mv_excluded_items;
  refresh materialized view concurrently public.mv_latest_call_records;
  refresh materialized view concurrently public.mv_smart_queue_base;
  refresh materialized view concurrently public.mv_industry_time_score;
end;
$function$;
