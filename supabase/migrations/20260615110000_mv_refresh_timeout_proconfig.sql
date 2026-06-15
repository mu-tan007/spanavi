-- MV refresh の statement_timeout を「関数 body の set local」から「proconfig」へ移す。
-- 背景: pg_cron 実行下では body 内の `set local statement_timeout` が効かず、DB 既定の
--       120秒で REFRESH MATERIALIZED VIEW CONCURRENTLY が打ち切られ大量失敗していた
--       （refresh_mv_industry_time_score が毎時失敗、smart_queue も timeout）。
--       proconfig で指定している refresh_mv_industry_summary は安定（失敗ほぼ無し）なので
--       同じ方式に統一する。クエリ自体は不変（集計値は変わらない）。

set local search_path = public, extensions;

-- 業種×時間帯スコア MV（分析用、緩やかに変化）。8分の猶予で確実に完走させる。
create or replace function public.refresh_mv_industry_time_score()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '8min'
as $function$
begin
  refresh materialized view concurrently public.mv_industry_time_score;
end;
$function$;

-- 汎用 MV refresh ガード（smart_queue_base 等が使用）。body の set local 3min を廃し
-- proconfig 5min に。ガード（直近3分スキップ＋advisory lock）はそのまま維持。
create or replace function public._refresh_mv_guarded(p_mv text)
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '5min'
as $function$
declare
  v_last timestamptz;
begin
  -- ガード1: 直近3分以内に更新済みならスキップ
  select refreshed_at into v_last from mv_refresh_log where mv_name = p_mv;
  if v_last is not null and v_last > now() - interval '3 minutes' then
    return;
  end if;
  -- ガード2: 他プロセスが同じMVを更新中なら後着はスキップ（積み上がり防止）
  if not pg_try_advisory_xact_lock(hashtext('mv_refresh:' || p_mv)) then
    return;
  end if;
  execute format('refresh materialized view concurrently public.%I', p_mv);
  insert into mv_refresh_log(mv_name, refreshed_at) values (p_mv, now())
  on conflict (mv_name) do update set refreshed_at = now();
end;
$function$;
