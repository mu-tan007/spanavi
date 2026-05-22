-- =====================================================================
-- 修正:
-- 1) detailed_query の日数フィルタを NULL 許容に
--    (called_at が NULL の「未架電」を、日数フィルタで誤って除外しない)
-- 2) キーマン断り用 partial index 追加
--    latest_reject CTE 高速化（PostgREST タイムアウト回避）
-- =====================================================================

set local search_path = public, extensions;

create index if not exists idx_cr_keyman_reject_latest
  on public.call_records (org_id, item_id, round desc, called_at desc)
  where status = 'キーマン断り';

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
       -- 日数フィルタは「未架電 (NULL)」も許容
       and (p_days_min is null or days_since_call is null or days_since_call >= p_days_min)
       and (p_days_max is null or days_since_call is null or days_since_call <= p_days_max)
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
