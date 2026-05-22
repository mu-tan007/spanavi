-- =====================================================================
-- mv_smart_queue_base: スマートキュー用 base materialized view
-- ---------------------------------------------------------------------
-- 経緯:
--   smart_queue_detailed_query / industry_status_combo が statement
--   timeout で 500 を返していた。原因は base CTE で 5万件 ×
--   company_master JOIN（btree index 無し）× mv_latest JOIN × NOT EXISTS
--   を毎回計算していたこと。
--
-- 対策:
--   1) company_master.company_name に btree index 追加（equality JOIN
--      は trigram GIN を使わず Seq Scan していた）
--   2) スマートキュー共通母数を mv_smart_queue_base として pre-compute
--      （アクティブリスト × 履歴に「アポ獲得/除外」なし × 直近が
--       「受付/キーマン再コール」でない、を満たす item のみ）
--   3) RPC は mv 1テーブルへの WHERE フィルタだけに簡素化
--
-- 結果: 38ms / 40,000 件 hit （以前は8秒超でタイムアウト）
-- =====================================================================

set local search_path = public, extensions;

-- (1) equality JOIN 用の btree index
create index if not exists idx_cm_company_name_btree
  on public.company_master (company_name);

-- (2) base mv
drop materialized view if exists public.mv_smart_queue_base;

create materialized view public.mv_smart_queue_base as
select
  cli.id as item_id,
  cli.list_id,
  cli.company,
  cli.phone,
  cm.industry_major,
  cm.prefecture,
  cm.revenue_k,
  cl.org_id,
  cl.name as list_name,
  cl.engagement_id,
  e.name as engagement_name,
  e.slug as engagement_slug,
  e.product_id,
  e.category_id,
  p.name as product_name,
  coalesce(mlc.status, '未架電') as status,
  mlc.called_at,
  mlc.record_id,
  case when mlc.called_at is null then null
       else extract(epoch from (now() - mlc.called_at)) / 86400.0 end as days_since_call
from public.call_list_items cli
join public.call_lists cl on cl.id = cli.list_id
-- 同名企業が company_master に複数ある場合は先頭1件のみ
left join lateral (
  select industry_major, prefecture, revenue_k
  from public.company_master
  where company_name = cli.company
  limit 1
) cm on true
left join public.engagements e on e.id = cl.engagement_id
left join public.products p on p.id = e.product_id
left join public.mv_latest_call_records mlc on mlc.item_id = cli.id
where (cl.is_archived is null or cl.is_archived = false)
  and not exists (
    select 1 from public.mv_excluded_items mex
     where mex.org_id = cl.org_id and mex.item_id = cli.id
  )
  and coalesce(mlc.status, '') not in ('受付再コール','キーマン再コール');

create unique index if not exists mv_smart_queue_base_pk
  on public.mv_smart_queue_base (item_id);
create index if not exists mv_smart_queue_base_org_status
  on public.mv_smart_queue_base (org_id, status);
create index if not exists mv_smart_queue_base_org_eng
  on public.mv_smart_queue_base (org_id, engagement_id);
create index if not exists mv_smart_queue_base_org_industry
  on public.mv_smart_queue_base (org_id, industry_major);
create index if not exists mv_smart_queue_base_org_prefecture
  on public.mv_smart_queue_base (org_id, prefecture);

grant select on public.mv_smart_queue_base to authenticated;

refresh materialized view public.mv_smart_queue_base;

-- (3) RPC を mv 経由に書き換え
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
  filtered as (
    select * from mv_smart_queue_base mb
    where mb.org_id = (select org_id from my_org)
      and (p_engagement_id is null or mb.engagement_id = p_engagement_id)
      and (p_statuses is null     or mb.status = any(p_statuses))
      and (p_prefectures is null  or mb.prefecture = any(p_prefectures))
      and (p_industries is null   or mb.industry_major = any(p_industries))
      and (p_revenue_min_k is null or (mb.revenue_k is not null and mb.revenue_k >= p_revenue_min_k))
      and (p_revenue_max_k is null or (mb.revenue_k is not null and mb.revenue_k <= p_revenue_max_k))
      and (p_days_min is null or mb.days_since_call is null or mb.days_since_call >= p_days_min)
      and (p_days_max is null or mb.days_since_call is null or mb.days_since_call <= p_days_max)
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
  base as (
    select mb.*,
           coalesce(mv.keyman_rate, 0) as time_match_score
    from mv_smart_queue_base mb
    left join mv_industry_time_score mv
      on mv.org_id = mb.org_id
     and mv.industry_major = mb.industry_major
     and mv.dow = (select dow from now_slot)
     and mv.hour = (select hour from now_slot)
    where mb.org_id = (select org_id from my_org)
      and (p_engagement_id is null or mb.engagement_id = p_engagement_id)
      and (p_industries is null or mb.industry_major = any(p_industries))
      and (p_statuses is null or mb.status = any(p_statuses))
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
