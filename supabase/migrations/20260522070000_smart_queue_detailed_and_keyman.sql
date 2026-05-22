-- =====================================================================
-- スマートキュー: 詳細条件抽出 + キーマン断り一覧 + 業種×ステータス組合せ
-- ---------------------------------------------------------------------
-- 共通母数: アクティブリスト × 履歴に「アポ獲得」「除外」がない
--           × 直近ステータスが「受付再コール」「キーマン再コール」ではない
-- =====================================================================

set local search_path = public, extensions;

create or replace function public.smart_queue_detailed_query(
  p_statuses text[] default null,
  p_prefectures text[] default null,
  p_industries text[] default null,
  p_revenue_min_k bigint default null,
  p_revenue_max_k bigint default null,
  p_days_min int default null,
  p_days_max int default null,
  p_engagement_id uuid default null,
  p_offset int default 0,
  p_limit int default 100
)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  excluded_items as (
    select distinct item_id from call_records
     where org_id = (select org_id from my_org) and status in ('アポ獲得','除外')
  ),
  base as (
    select cli.id as item_id, cli.list_id, cli.company, cli.phone,
           cm.industry_major, cm.prefecture, cm.revenue_k,
           cl.name as list_name, cl.engagement_id,
           e.name as engagement_name, e.slug as engagement_slug,
           coalesce(mlc.status, '未架電') as status,
           mlc.called_at, mlc.record_id,
           case when mlc.called_at is null then null
                else extract(epoch from (now() - mlc.called_at)) / 86400.0 end as days_since_call
    from call_list_items cli
    join call_lists cl on cl.id = cli.list_id
    left join company_master cm on cm.company_name = cli.company
    left join engagements e on e.id = cl.engagement_id
    left join mv_latest_call_records mlc on mlc.item_id = cli.id
    where cl.org_id = (select org_id from my_org)
      and (cl.is_archived is null or cl.is_archived = false)
      and cli.id not in (select item_id from excluded_items)
      and coalesce(mlc.status, '') not in ('受付再コール','キーマン再コール')
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
  ),
  filtered as (
    select * from base
     where (p_statuses is null    or status = any(p_statuses))
       and (p_prefectures is null or prefecture = any(p_prefectures))
       and (p_industries is null  or industry_major = any(p_industries))
       and (p_revenue_min_k is null or (revenue_k is not null and revenue_k >= p_revenue_min_k))
       and (p_revenue_max_k is null or (revenue_k is not null and revenue_k <= p_revenue_max_k))
       and (p_days_min is null    or (days_since_call is not null and days_since_call >= p_days_min))
       and (p_days_max is null    or (days_since_call is not null and days_since_call <= p_days_max))
  ),
  page as (
    select * from filtered order by days_since_call desc nulls last, company asc
    offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'item_id', item_id, 'list_id', list_id, 'record_id', record_id,
      'company', company, 'phone', phone, 'industry', industry_major,
      'prefecture', prefecture, 'revenue_k', revenue_k,
      'status', status, 'called_at', called_at,
      'days_since_call', case when days_since_call is null then null else round(days_since_call::numeric, 1) end,
      'list_name', list_name, 'engagement_id', engagement_id,
      'engagement_name', engagement_name, 'engagement_slug', engagement_slug
    )), '[]'::jsonb)
  )
  from page;
$function$;

grant execute on function public.smart_queue_detailed_query(text[], text[], text[], bigint, bigint, int, int, uuid, int, int) to authenticated;

create or replace function public.smart_queue_keyman_rejections(
  p_engagement_id uuid default null,
  p_offset int default 0,
  p_limit int default 100
)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  excluded_items as (
    select distinct item_id from call_records
     where org_id = (select org_id from my_org) and status in ('アポ獲得','除外')
  ),
  latest_reject as (
    select distinct on (cr.item_id)
      cr.id as record_id, cr.item_id, cr.list_id, cr.called_at,
      cr.getter_name, cr.recording_url, cr.rejection_reason, cr.report_supplement
    from call_records cr
    where cr.org_id = (select org_id from my_org) and cr.status = 'キーマン断り'
    order by cr.item_id, cr.round desc, cr.called_at desc
  ),
  base as (
    select lr.record_id, lr.item_id, lr.list_id, lr.called_at, lr.getter_name,
           lr.recording_url, lr.rejection_reason, lr.report_supplement,
           cli.company, cli.phone,
           cm.industry_major, cm.prefecture, cm.revenue_k,
           cl.name as list_name, cl.engagement_id,
           e.name as engagement_name,
           mlc.status as latest_status,
           extract(epoch from (now() - lr.called_at)) / 86400.0 as days_since_reject
    from latest_reject lr
    join call_lists cl on cl.id = lr.list_id
    left join call_list_items cli on cli.id = lr.item_id
    left join company_master cm on cm.company_name = cli.company
    left join engagements e on e.id = cl.engagement_id
    left join mv_latest_call_records mlc on mlc.item_id = lr.item_id
    where (cl.is_archived is null or cl.is_archived = false)
      and lr.item_id not in (select item_id from excluded_items)
      and coalesce(mlc.status, '') not in ('受付再コール','キーマン再コール')
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
  ),
  page as (
    select * from base order by days_since_reject asc, company asc
    offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'record_id', record_id, 'item_id', item_id, 'list_id', list_id,
      'company', company, 'phone', phone, 'industry', industry_major,
      'prefecture', prefecture, 'revenue_k', revenue_k,
      'list_name', list_name, 'engagement_id', engagement_id, 'engagement_name', engagement_name,
      'getter_name', getter_name, 'called_at', called_at,
      'days_since_reject', round(days_since_reject::numeric, 1),
      'recording_url', recording_url,
      'rejection_reason', rejection_reason, 'report_supplement', report_supplement,
      'latest_status', latest_status
    )), '[]'::jsonb)
  )
  from page;
$function$;

grant execute on function public.smart_queue_keyman_rejections(uuid, int, int) to authenticated;

create or replace function public.smart_queue_industry_status_combo(
  p_industries text[] default null,
  p_statuses text[] default null,
  p_engagement_id uuid default null,
  p_offset int default 0,
  p_limit int default 100
)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  now_slot as (
    select extract(dow from now() at time zone 'Asia/Tokyo')::int as dow,
           extract(hour from now() at time zone 'Asia/Tokyo')::int as hour
  ),
  excluded_items as (
    select distinct item_id from call_records
     where org_id = (select org_id from my_org) and status in ('アポ獲得','除外')
  ),
  base as (
    select cli.id as item_id, cli.list_id, cli.company, cli.phone,
           cm.industry_major, cm.prefecture, cm.revenue_k,
           cl.name as list_name, cl.engagement_id,
           e.name as engagement_name,
           coalesce(mlc.status, '未架電') as status,
           mlc.called_at, mlc.record_id,
           coalesce(mv.keyman_rate, 0) as time_match_score
    from call_list_items cli
    join call_lists cl on cl.id = cli.list_id
    left join company_master cm on cm.company_name = cli.company
    left join engagements e on e.id = cl.engagement_id
    left join mv_latest_call_records mlc on mlc.item_id = cli.id
    left join mv_industry_time_score mv
      on mv.org_id = (select org_id from my_org)
     and mv.industry_major = cm.industry_major
     and mv.dow = (select dow from now_slot)
     and mv.hour = (select hour from now_slot)
    where cl.org_id = (select org_id from my_org)
      and (cl.is_archived is null or cl.is_archived = false)
      and cli.id not in (select item_id from excluded_items)
      and coalesce(mlc.status, '') not in ('受付再コール','キーマン再コール')
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
      and (p_industries is null or cm.industry_major = any(p_industries))
      and (p_statuses is null or coalesce(mlc.status, '未架電') = any(p_statuses))
  ),
  page as (
    select * from base order by time_match_score desc, company asc
    offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'item_id', item_id, 'list_id', list_id, 'record_id', record_id,
      'company', company, 'phone', phone, 'industry', industry_major,
      'prefecture', prefecture, 'revenue_k', revenue_k,
      'status', status, 'called_at', called_at,
      'list_name', list_name, 'engagement_id', engagement_id,
      'engagement_name', engagement_name, 'time_match_score', time_match_score
    )), '[]'::jsonb)
  )
  from page;
$function$;

grant execute on function public.smart_queue_industry_status_combo(text[], text[], uuid, int, int) to authenticated;
