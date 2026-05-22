-- =====================================================================
-- スマートキュー単一化：mv_latest_call_records + smart_queue_unified
-- ---------------------------------------------------------------------
-- 経緯:
--   B（未接続フォロー）が空表示だった根因：
--     全call_records 10万件超に対する DISTINCT ON item_id が重く、
--     PostgREST タイムアウト（8秒）で空応答を返していた。
--   解決策：
--     1) mv_latest_call_records: 各 item の最新 call_record を事前計算
--     2) smart_queue_unified: 期限超過/未接続/未架電 を混在で返す単一RPC
--     UI 側はタブ廃止、状況プリセット＋業種フィルタで一覧する単一キューに
-- =====================================================================

set local search_path = public, extensions;

-- ───────────────────────────────────────────────────────────────────────
-- 1) 各 item の最新 call_record materialized view
-- ───────────────────────────────────────────────────────────────────────
drop materialized view if exists public.mv_latest_call_records;

create materialized view public.mv_latest_call_records as
select distinct on (item_id)
  id as record_id,
  item_id, list_id, org_id, caller_id, round,
  status, called_at, getter_name, memo,
  recording_url, transcript, rejection_reason
from public.call_records
order by item_id, round desc, called_at desc;

create unique index if not exists mv_latest_call_records_pk
  on public.mv_latest_call_records (item_id);

create index if not exists mv_latest_call_records_org_status
  on public.mv_latest_call_records (org_id, status, called_at desc);

grant select on public.mv_latest_call_records to authenticated;

refresh materialized view public.mv_latest_call_records;

-- ───────────────────────────────────────────────────────────────────────
-- 2) 単一キューRPC
--    期限超過再コール / 未接続フォロー / 未架電 を混在で返す
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.smart_queue_unified(
  p_engagement_id uuid default null,
  p_max int default 1000
)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  now_slot as (
    select extract(dow from now() at time zone 'Asia/Tokyo')::int as dow,
           extract(hour from now() at time zone 'Asia/Tokyo')::int as hour
  ),
  overdue as (
    select
      mlc.record_id, mlc.list_id, mlc.item_id, mlc.status,
      mlc.called_at, mlc.getter_name,
      'overdue_recall'::text as category,
      ((mlc.memo::jsonb)->>'recall_date' || 'T'
        || coalesce(nullif((mlc.memo::jsonb)->>'recall_time',''), '00:00')
        || ':00+09:00')::timestamptz as recall_at_ts,
      (mlc.memo::jsonb)->>'recall_date' as recall_date,
      coalesce(nullif((mlc.memo::jsonb)->>'recall_time', ''), '00:00') as recall_time,
      (mlc.memo::jsonb)->>'assignee' as assignee
    from mv_latest_call_records mlc
    join call_lists cl on cl.id = mlc.list_id
    where mlc.org_id = (select org_id from my_org)
      and mlc.status in ('受付再コール', 'キーマン再コール')
      and (cl.is_archived is null or cl.is_archived = false)
      and nullif((mlc.memo::jsonb)->>'recall_date', '') is not null
      and coalesce(nullif((mlc.memo::jsonb)->>'recall_completed',''), 'false')::boolean = false
      and ((mlc.memo::jsonb)->>'recall_date' || 'T'
            || coalesce(nullif((mlc.memo::jsonb)->>'recall_time',''), '00:00')
            || ':00+09:00')::timestamptz < now()
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
  ),
  unconnected as (
    select
      mlc.record_id, mlc.list_id, mlc.item_id, mlc.status,
      mlc.called_at, mlc.getter_name,
      'unconnected_followup'::text as category,
      null::timestamptz as recall_at_ts,
      null::text as recall_date,
      null::text as recall_time,
      null::text as assignee
    from mv_latest_call_records mlc
    join call_lists cl on cl.id = mlc.list_id
    where mlc.org_id = (select org_id from my_org)
      and mlc.status in ('キーマン不在', '不通', '受付ブロック')
      and (cl.is_archived is null or cl.is_archived = false)
      and mlc.called_at >= now() - interval '30 days'
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
  ),
  untouched as (
    select
      null::uuid as record_id,
      cli.list_id, cli.id as item_id,
      '未架電'::text as status,
      null::timestamptz as called_at,
      null::text as getter_name,
      'untouched'::text as category,
      null::timestamptz as recall_at_ts,
      null::text as recall_date,
      null::text as recall_time,
      null::text as assignee
    from call_list_items cli
    join call_lists cl on cl.id = cli.list_id
    where cl.org_id = (select org_id from my_org)
      and (cl.is_archived is null or cl.is_archived = false)
      and not exists (select 1 from mv_latest_call_records mlc where mlc.item_id = cli.id)
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
  ),
  all_rows as (
    select * from overdue
    union all
    select * from unconnected
    union all
    select * from untouched
  ),
  enriched as (
    select
      ar.*,
      cli.company, cli.phone,
      cm.industry_major, cm.prefecture,
      cl.name as list_name, cl.engagement_id,
      e.name as engagement_name, e.slug as engagement_slug,
      e.product_id, p.name as product_name,
      coalesce(mv.keyman_rate, 0) as time_match_score,
      case
        when ar.recall_at_ts is not null
          then extract(epoch from (now() - ar.recall_at_ts)) / 86400.0
        when ar.called_at is not null
          then extract(epoch from (now() - ar.called_at)) / 86400.0
        else null
      end as days_metric
    from all_rows ar
    left join call_list_items cli on cli.id = ar.item_id
    left join call_lists cl on cl.id = ar.list_id
    left join engagements e on e.id = cl.engagement_id
    left join products p on p.id = e.product_id
    left join company_master cm on cm.company_name = cli.company
    left join mv_industry_time_score mv
      on mv.org_id = (select org_id from my_org)
     and mv.industry_major = cm.industry_major
     and mv.dow = (select dow from now_slot)
     and mv.hour = (select hour from now_slot)
  ),
  scored as (
    select * from enriched
    order by
      case when category = 'overdue_recall' then 0 else 1 end,
      time_match_score desc,
      days_metric desc nulls last
    limit p_max
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'record_id',        record_id,
      'list_id',          list_id,
      'item_id',          item_id,
      'status',           status,
      'category',         category,
      'company',          company,
      'phone',            phone,
      'industry',         industry_major,
      'prefecture',       prefecture,
      'list_name',        list_name,
      'engagement_id',    engagement_id,
      'engagement_name',  engagement_name,
      'engagement_slug',  engagement_slug,
      'product_id',       product_id,
      'product_name',     product_name,
      'getter_name',      getter_name,
      'called_at',        called_at,
      'recall_date',      recall_date,
      'recall_time',      recall_time,
      'assignee',         assignee,
      'days_metric',      case when days_metric is null then null else round(days_metric::numeric, 1) end,
      'time_match_score', time_match_score
    )
  ), '[]'::jsonb)
  from scored;
$function$;

grant execute on function public.smart_queue_unified(uuid, int) to authenticated;
