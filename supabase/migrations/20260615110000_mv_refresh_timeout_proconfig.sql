-- MV refresh の statement_timeout 整理。関数 body の `set local statement_timeout` を廃止。
-- 背景: pg_cron 実行下で大量失敗していた（refresh_mv_industry_time_score が毎時 120秒で
--       timeout、smart_queue も時々 timeout）。
-- 重要な学び: statement_timeout は「トップレベル文の開始時」に決まるため、関数内
--       （set local / proconfig いずれも）で変えても、実行中の `SELECT refresh_*()` 自身には
--       効かない。実効的な修正は **cron のコマンド側で先に SET statement_timeout する**こと
--       （例: "SET statement_timeout='8min'; SELECT public.refresh_mv_industry_time_score();"）。
--       これは cron ジョブ定義（DB 運用状態）側で適用済み。
-- 本マイグレーションでは body の set local を除去し、proconfig を保険として残すのみ
--       （nested 呼び出し経路での防御。クエリ・集計値は不変）。
-- 実測: refresh_mv_industry_time_score ≈ 277秒 / smart_queue ≈ 43秒。
--       industry_time_score は併せて毎時→深夜2回(JST)へ頻度削減し IO 負荷を低減。

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
