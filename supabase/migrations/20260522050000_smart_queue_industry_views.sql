-- =====================================================================
-- 業種接続率データビュー用 RPC + B/C RPC を mv_industry_time_score 経由に切替
-- 経緯: B/C の旧実装は industry_score CTE が重く PostgREST タイムアウト
--       (空応答) になっていた。mv 経由に切り替えて高速化。
-- =====================================================================

set local search_path = public, extensions;

-- 現在(JST) 曜日/時間帯の全業種接続率ランキング
create or replace function public.industry_score_now(p_min_samples int default 30)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  now_slot as (
    select extract(dow  from now() at time zone 'Asia/Tokyo')::int as dow,
           extract(hour from now() at time zone 'Asia/Tokyo')::int as hour
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'industry_major',   mv.industry_major,
      'total',            mv.total,
      'keyman_connected', mv.keyman_connected,
      'keyman_rate',      mv.keyman_rate,
      'dow',              mv.dow,
      'hour',             mv.hour
    ) order by mv.keyman_rate desc nulls last, mv.total desc
  ), '[]'::jsonb)
  from mv_industry_time_score mv, now_slot ns, my_org
  where mv.org_id = my_org.org_id
    and mv.dow  = ns.dow
    and mv.hour = ns.hour
    and mv.total >= p_min_samples;
$function$;

grant execute on function public.industry_score_now(int) to authenticated;

-- 指定業種の 曜日×時間帯 ヒートマップ
create or replace function public.industry_score_heatmap(p_industry text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'dow',              mv.dow,
      'hour',             mv.hour,
      'total',            mv.total,
      'keyman_connected', mv.keyman_connected,
      'keyman_rate',      mv.keyman_rate
    ) order by mv.dow, mv.hour
  ), '[]'::jsonb)
  from mv_industry_time_score mv, my_org
  where mv.org_id = my_org.org_id
    and mv.industry_major = p_industry;
$function$;

grant execute on function public.industry_score_heatmap(text) to authenticated;

-- 全業種一覧（業種選択ドロップダウン用、合計サンプル数で並べる）
create or replace function public.industry_score_industries(p_min_samples int default 50)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  agg as (
    select mv.industry_major,
           sum(mv.total)::bigint as total,
           sum(mv.keyman_connected)::bigint as keyman_connected,
           round(100.0 * sum(mv.keyman_connected) / nullif(sum(mv.total), 0)::numeric, 2) as keyman_rate
    from mv_industry_time_score mv, my_org
    where mv.org_id = my_org.org_id
    group by mv.industry_major
    having sum(mv.total) >= p_min_samples
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'industry_major',   industry_major,
      'total',            total,
      'keyman_connected', keyman_connected,
      'keyman_rate',      keyman_rate
    ) order by total desc
  ), '[]'::jsonb)
  from agg;
$function$;

grant execute on function public.industry_score_industries(int) to authenticated;

-- B: 未接続フォロー（mv 経由に書き換え）
create or replace function public.smart_queue_unconnected_followup(
  p_engagement_id uuid default null,
  p_status text default null
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
  latest as (
    select distinct on (item_id) *
    from call_records
    where org_id = (select org_id from my_org)
    order by item_id, round desc, called_at desc
  ),
  candidates as (
    select latest.id as record_id, latest.list_id, latest.item_id, latest.status,
           latest.called_at, latest.getter_name,
           cli.company, cli.phone, cm.industry_major, cm.prefecture,
           cl.name as list_name, cl.engagement_id,
           e.name as engagement_name, e.slug as engagement_slug,
           e.product_id, p.name as product_name,
           coalesce(mv.keyman_rate, 0) as time_match_score,
           extract(epoch from (now() - latest.called_at)) / 86400.0 as days_since_call
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join call_list_items cli on cli.id = latest.item_id
    left join company_master cm on cm.company_name = cli.company
    left join engagements e on e.id = cl.engagement_id
    left join products p on p.id = e.product_id
    left join mv_industry_time_score mv
      on mv.org_id = (select org_id from my_org)
     and mv.industry_major = cm.industry_major
     and mv.dow  = (select dow  from now_slot)
     and mv.hour = (select hour from now_slot)
    where latest.status in ('キーマン不在', '不通', '受付ブロック')
      and (cl.is_archived is null or cl.is_archived = false)
      and latest.called_at >= now() - interval '30 days'
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
      and (p_status is null or latest.status = p_status)
  ),
  top500 as (
    select * from candidates
    order by time_match_score desc, days_since_call asc
    limit 500
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'record_id', record_id, 'list_id', list_id, 'item_id', item_id, 'status', status,
      'company', company, 'phone', phone, 'industry', industry_major, 'prefecture', prefecture,
      'list_name', list_name, 'engagement_id', engagement_id,
      'engagement_name', engagement_name, 'engagement_slug', engagement_slug,
      'product_id', product_id, 'product_name', product_name,
      'getter_name', getter_name, 'called_at', called_at,
      'days_since_call', round(days_since_call::numeric, 1),
      'time_match_score', time_match_score
    ) order by time_match_score desc, days_since_call asc
  ), '[]'::jsonb)
  from top500;
$function$;

-- C: 新規開拓（mv 経由に書き換え）
create or replace function public.smart_queue_new_prospects(
  p_engagement_id uuid default null
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
  untouched as (
    select cli.id as item_id, cli.list_id, cli.company, cli.phone,
           cm.industry_major, cm.prefecture,
           cl.name as list_name, cl.engagement_id,
           e.name as engagement_name, e.slug as engagement_slug,
           e.product_id, p.name as product_name,
           coalesce(mv.keyman_rate, 0) as time_match_score
    from call_list_items cli
    join call_lists cl on cl.id = cli.list_id
    left join company_master cm on cm.company_name = cli.company
    left join engagements e on e.id = cl.engagement_id
    left join products p on p.id = e.product_id
    left join mv_industry_time_score mv
      on mv.org_id = (select org_id from my_org)
     and mv.industry_major = cm.industry_major
     and mv.dow  = (select dow  from now_slot)
     and mv.hour = (select hour from now_slot)
    where cl.org_id = (select org_id from my_org)
      and (cl.is_archived is null or cl.is_archived = false)
      and not exists (select 1 from call_records cr where cr.item_id = cli.id)
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
  ),
  top500 as (
    select * from untouched
    order by time_match_score desc, company asc
    limit 500
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id, 'list_id', list_id, 'company', company, 'phone', phone,
      'industry', industry_major, 'prefecture', prefecture,
      'list_name', list_name, 'engagement_id', engagement_id,
      'engagement_name', engagement_name, 'engagement_slug', engagement_slug,
      'product_id', product_id, 'product_name', product_name,
      'time_match_score', time_match_score
    ) order by time_match_score desc, company asc
  ), '[]'::jsonb)
  from top500;
$function$;
