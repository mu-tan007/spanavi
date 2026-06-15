-- ============================================================
-- 特殊条件抽出 ②③④ にクライアント絞り込みを追加
--   ② smart_queue_industry_status_combo / _ids
--        → call_lists.client_id → clients.name を join。
--          p_client_names でサーバー側絞り込み + clients 選択肢を返す
--   ③ dashboard_overdue_reception_recalls
--   ④ dashboard_overdue_recalls
--        → 各行に client_name を追加（絞り込みは JS 側 = 既存 useEngFilter 方式と統一）
--   ⑤ dashboard_reapproach_candidates は既に client_name を返すため変更なし
-- ============================================================

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- ② 業種 × ステータス組合せ（表示用）
-- ------------------------------------------------------------
drop function if exists smart_queue_industry_status_combo(text[], text[], uuid, integer, integer, uuid[]);

create or replace function smart_queue_industry_status_combo(
  p_industries     text[]  default null,
  p_statuses       text[]  default null,
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
  now_slot as (
    select extract(dow from now() at time zone 'Asia/Tokyo')::int as dow,
           extract(hour from now() at time zone 'Asia/Tokyo')::int as hour
  ),
  base as (
    select mb.*,
           cl.client_id,
           c.name as client_name,
           coalesce(mv.keyman_rate, 0) as time_match_score
    from mv_smart_queue_base mb
    left join call_lists cl on cl.id = mb.list_id
    left join clients c on c.id = cl.client_id
    left join mv_industry_time_score mv
      on mv.org_id = mb.org_id
     and mv.industry_major = mb.industry_major
     and mv.dow = (select dow from now_slot)
     and mv.hour = (select hour from now_slot)
    where mb.org_id = (select org_id from my_org)
      and (p_engagement_id is null or mb.engagement_id = p_engagement_id)
      and (p_engagement_ids is null or mb.engagement_id = any(p_engagement_ids))
      and (p_industries is null or mb.industry_major = any(p_industries))
      and (p_statuses is null or mb.status = any(p_statuses))
      and (p_client_names is null or c.name = any(p_client_names))
  ),
  page as (
    select * from base order by time_match_score desc, company asc
    offset p_offset limit p_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'clients', (select coalesce(jsonb_agg(distinct client_name order by client_name)
                                 filter (where client_name is not null), '[]'::jsonb) from base),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'item_id', item_id, 'list_id', list_id, 'record_id', record_id,
      'company', company, 'phone', phone, 'industry', industry_major,
      'prefecture', prefecture, 'revenue_k', revenue_k,
      'status', status, 'called_at', called_at,
      'list_name', list_name, 'engagement_id', engagement_id,
      'engagement_name', engagement_name, 'time_match_score', time_match_score,
      'client_id', client_id, 'client_name', client_name
    )), '[]'::jsonb)
  )
  from page;
$function$;

grant execute on function smart_queue_industry_status_combo(text[], text[], uuid, integer, integer, uuid[], text[]) to authenticated;

-- ------------------------------------------------------------
-- ② 業種 × ステータス組合せ（架電キュー ids）
-- ------------------------------------------------------------
drop function if exists smart_queue_industry_status_combo_ids(text[], text[], uuid, uuid[]);

create or replace function smart_queue_industry_status_combo_ids(
  p_industries     text[] default null,
  p_statuses       text[] default null,
  p_engagement_id  uuid   default null,
  p_engagement_ids uuid[] default null,
  p_client_names   text[] default null
)
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  now_slot as (
    select extract(dow from now() at time zone 'Asia/Tokyo')::int as dow,
           extract(hour from now() at time zone 'Asia/Tokyo')::int as hour
  ),
  base as (
    select mb.item_id, mb.list_id,
           coalesce(mv.keyman_rate, 0) as time_match_score
    from mv_smart_queue_base mb
    left join call_lists cl on cl.id = mb.list_id
    left join clients c on c.id = cl.client_id
    left join mv_industry_time_score mv
      on mv.org_id = mb.org_id
     and mv.industry_major = mb.industry_major
     and mv.dow = (select dow from now_slot)
     and mv.hour = (select hour from now_slot)
    where mb.org_id = (select org_id from my_org)
      and (p_engagement_id is null or mb.engagement_id = p_engagement_id)
      and (p_engagement_ids is null or mb.engagement_id = any(p_engagement_ids))
      and (p_industries is null or mb.industry_major = any(p_industries))
      and (p_statuses is null or mb.status = any(p_statuses))
      and (p_client_names is null or c.name = any(p_client_names))
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'list_id', list_id)
    order by time_match_score desc), '[]'::jsonb)
  from base;
$function$;

grant execute on function smart_queue_industry_status_combo_ids(text[], text[], uuid, uuid[], text[]) to authenticated;

-- ------------------------------------------------------------
-- ③ 受付再コール超過: 各行に client_name を追加
-- ------------------------------------------------------------
create or replace function dashboard_overdue_reception_recalls()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  latest as (
    select distinct on (item_id) *,
      case when left(memo, 1) = '{' then memo::jsonb end as memo_j
    from call_records
    where org_id = (select org_id from my_org)
    order by item_id, round desc, called_at desc
  ),
  filtered as (
    select
      latest.id as record_id, latest.list_id, latest.item_id,
      cli.company, cl.name as list_name,
      cl.client_id, c.name as client_name,
      latest.memo_j->>'recall_date' as recall_date,
      coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00') as recall_time,
      latest.memo_j->>'assignee' as assignee,
      latest.getter_name, latest.called_at,
      ((latest.memo_j->>'recall_date') || 'T'
        || coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz as _recall_at
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join clients c on c.id = cl.client_id
    left join call_list_items cli on cli.id = latest.item_id
    where latest.status = '受付再コール'
      and (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = latest.item_id
      )
      and nullif(latest.memo_j->>'recall_date', '') is not null
      and coalesce(nullif(latest.memo_j->>'recall_completed', ''), 'false')::boolean = false
      and ((latest.memo_j->>'recall_date') || 'T'
            || coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00')
            || ':00+09:00')::timestamptz < now()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', record_id, 'list_id', list_id, 'item_id', item_id,
    'company', company, 'list_name', list_name,
    'client_id', client_id, 'client_name', client_name,
    'recall_date', recall_date, 'recall_time', recall_time,
    'assignee', assignee, 'getter_name', getter_name, 'called_at', called_at
  ) order by _recall_at asc), '[]'::jsonb)
  from filtered;
$function$;

-- ------------------------------------------------------------
-- ④ キーマン再コール超過: 各行に client_name を追加
-- ------------------------------------------------------------
create or replace function dashboard_overdue_recalls()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  latest as (
    select distinct on (item_id) *,
      case when left(memo, 1) = '{' then memo::jsonb end as memo_j
    from call_records
    where org_id = (select org_id from my_org)
    order by item_id, round desc, called_at desc
  ),
  filtered as (
    select
      latest.id as record_id, latest.list_id, latest.item_id,
      cli.company, cl.name as list_name,
      cl.client_id, c.name as client_name,
      latest.memo_j->>'recall_date' as recall_date,
      coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00') as recall_time,
      latest.memo_j->>'assignee' as assignee,
      latest.getter_name, latest.called_at,
      ((latest.memo_j->>'recall_date') || 'T'
        || coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz as _recall_at
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join clients c on c.id = cl.client_id
    left join call_list_items cli on cli.id = latest.item_id
    where latest.status = 'キーマン再コール'
      and (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = latest.item_id
      )
      and nullif(latest.memo_j->>'recall_date', '') is not null
      and coalesce(nullif(latest.memo_j->>'recall_completed', ''), 'false')::boolean = false
      and ((latest.memo_j->>'recall_date') || 'T'
            || coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00')
            || ':00+09:00')::timestamptz < now()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', record_id, 'list_id', list_id, 'item_id', item_id,
    'company', company, 'list_name', list_name,
    'client_id', client_id, 'client_name', client_name,
    'recall_date', recall_date, 'recall_time', recall_time,
    'assignee', assignee, 'getter_name', getter_name, 'called_at', called_at
  ) order by _recall_at asc), '[]'::jsonb)
  from filtered;
$function$;
