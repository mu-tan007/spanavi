-- ============================================================
-- 詳細条件抽出にもクライアント絞り込みを追加
--   smart_queue_detailed_query / _ids に call_lists→clients を join、
--   p_client_names でサーバー側絞り込み + client_id/client_name を行に追加。
--   クライアント選択肢は検索前から出せるよう専用 RPC smart_queue_client_options() を新設。
-- ============================================================

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- クライアント選択肢（org の架電対象に存在するクライアント名一覧）
-- ------------------------------------------------------------
create or replace function smart_queue_client_options()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id)
  select coalesce(jsonb_agg(distinct c.name order by c.name)
                   filter (where c.name is not null), '[]'::jsonb)
  from mv_smart_queue_base mb
  join call_lists cl on cl.id = mb.list_id
  join clients c on c.id = cl.client_id
  where mb.org_id = (select org_id from my_org);
$function$;

grant execute on function smart_queue_client_options() to authenticated;

-- ------------------------------------------------------------
-- 詳細条件抽出（表示用）
-- ------------------------------------------------------------
drop function if exists smart_queue_detailed_query(text[], text[], text[], bigint, bigint, integer, integer, uuid, integer, integer, uuid[]);

create or replace function smart_queue_detailed_query(
  p_statuses       text[]  default null,
  p_prefectures    text[]  default null,
  p_industries     text[]  default null,
  p_revenue_min_k  bigint  default null,
  p_revenue_max_k  bigint  default null,
  p_days_min       integer default null,
  p_days_max       integer default null,
  p_engagement_id  uuid    default null,
  p_offset         integer default 0,
  p_limit          integer default 200,
  p_engagement_ids uuid[]  default null,
  p_client_names   text[]  default null
)
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  filtered as (
    select mb.*, cl.client_id, c.name as client_name
    from mv_smart_queue_base mb
    left join call_lists cl on cl.id = mb.list_id
    left join clients c on c.id = cl.client_id
    where mb.org_id = (select org_id from my_org)
      and (p_engagement_id is null or mb.engagement_id = p_engagement_id)
      and (p_engagement_ids is null or mb.engagement_id = any(p_engagement_ids))
      and (p_statuses is null     or mb.status = any(p_statuses))
      and (p_prefectures is null  or mb.prefecture = any(p_prefectures))
      and (p_industries is null   or mb.industry_major = any(p_industries))
      and (p_revenue_min_k is null or (mb.revenue_k is not null and mb.revenue_k >= p_revenue_min_k))
      and (p_revenue_max_k is null or (mb.revenue_k is not null and mb.revenue_k <= p_revenue_max_k))
      and (p_days_min is null or mb.days_since_call is null or mb.days_since_call >= p_days_min)
      and (p_days_max is null or mb.days_since_call is null or mb.days_since_call <= p_days_max)
      and (p_client_names is null or c.name = any(p_client_names))
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
      'engagement_name', engagement_name, 'engagement_slug', engagement_slug,
      'client_id', client_id, 'client_name', client_name
    )), '[]'::jsonb)
  )
  from page;
$function$;

grant execute on function smart_queue_detailed_query(text[], text[], text[], bigint, bigint, integer, integer, uuid, integer, integer, uuid[], text[]) to authenticated;

-- ------------------------------------------------------------
-- 詳細条件抽出（架電キュー ids）
-- ------------------------------------------------------------
drop function if exists smart_queue_detailed_query_ids(text[], text[], text[], bigint, bigint, integer, integer, uuid, uuid[]);

create or replace function smart_queue_detailed_query_ids(
  p_statuses       text[]  default null,
  p_prefectures    text[]  default null,
  p_industries     text[]  default null,
  p_revenue_min_k  bigint  default null,
  p_revenue_max_k  bigint  default null,
  p_days_min       integer default null,
  p_days_max       integer default null,
  p_engagement_id  uuid    default null,
  p_engagement_ids uuid[]  default null,
  p_client_names   text[]  default null
)
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  filtered as (
    select mb.item_id, mb.list_id, mb.days_since_call, mb.company
    from mv_smart_queue_base mb
    left join call_lists cl on cl.id = mb.list_id
    left join clients c on c.id = cl.client_id
    where mb.org_id = (select org_id from my_org)
      and (p_engagement_id is null or mb.engagement_id = p_engagement_id)
      and (p_engagement_ids is null or mb.engagement_id = any(p_engagement_ids))
      and (p_statuses is null     or mb.status = any(p_statuses))
      and (p_prefectures is null  or mb.prefecture = any(p_prefectures))
      and (p_industries is null   or mb.industry_major = any(p_industries))
      and (p_revenue_min_k is null or (mb.revenue_k is not null and mb.revenue_k >= p_revenue_min_k))
      and (p_revenue_max_k is null or (mb.revenue_k is not null and mb.revenue_k <= p_revenue_max_k))
      and (p_days_min is null or mb.days_since_call is null or mb.days_since_call >= p_days_min)
      and (p_days_max is null or mb.days_since_call is null or mb.days_since_call <= p_days_max)
      and (p_client_names is null or c.name = any(p_client_names))
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'list_id', list_id)
    order by days_since_call desc nulls last, company asc), '[]'::jsonb)
  from filtered;
$function$;

grant execute on function smart_queue_detailed_query_ids(text[], text[], text[], bigint, bigint, integer, integer, uuid, uuid[], text[]) to authenticated;
