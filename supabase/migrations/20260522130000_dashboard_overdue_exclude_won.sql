-- =====================================================================
-- dashboard_overdue_reception_recalls / dashboard_overdue_recalls
-- に「履歴にアポ獲得/除外あり」の除外（mv_excluded_items 経由）を追加。
-- スマートキュー③④ + ダッシュボード両方で、既にアポ取れた企業や
-- 除外済企業を超過リストから外す。
-- =====================================================================

set local search_path = public, extensions;

create or replace function public.dashboard_overdue_reception_recalls()
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  latest as (
    select distinct on (item_id) *
    from call_records
    where org_id = (select org_id from my_org)
    order by item_id, round desc, called_at desc
  ),
  filtered as (
    select
      latest.id as record_id, latest.list_id, latest.item_id,
      cli.company, cl.name as list_name,
      (latest.memo::jsonb)->>'recall_date' as recall_date,
      coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00') as recall_time,
      (latest.memo::jsonb)->>'assignee' as assignee,
      latest.getter_name, latest.called_at,
      ((latest.memo::jsonb)->>'recall_date' || 'T'
        || coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz as _recall_at
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join call_list_items cli on cli.id = latest.item_id
    where latest.status = '受付再コール'
      and (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = latest.item_id
      )
      and nullif((latest.memo::jsonb)->>'recall_date', '') is not null
      and coalesce(nullif((latest.memo::jsonb)->>'recall_completed', ''), 'false')::boolean = false
      and ((latest.memo::jsonb)->>'recall_date' || 'T'
            || coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00')
            || ':00+09:00')::timestamptz < now()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', record_id, 'list_id', list_id, 'item_id', item_id,
    'company', company, 'list_name', list_name,
    'recall_date', recall_date, 'recall_time', recall_time,
    'assignee', assignee, 'getter_name', getter_name, 'called_at', called_at
  ) order by _recall_at asc), '[]'::jsonb)
  from filtered;
$function$;

create or replace function public.dashboard_overdue_recalls()
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  latest as (
    select distinct on (item_id) *
    from call_records
    where org_id = (select org_id from my_org)
    order by item_id, round desc, called_at desc
  ),
  filtered as (
    select
      latest.id as record_id, latest.list_id, latest.item_id,
      cli.company, cl.name as list_name,
      (latest.memo::jsonb)->>'recall_date' as recall_date,
      coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00') as recall_time,
      (latest.memo::jsonb)->>'assignee' as assignee,
      latest.getter_name, latest.called_at,
      ((latest.memo::jsonb)->>'recall_date' || 'T'
        || coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz as _recall_at
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join call_list_items cli on cli.id = latest.item_id
    where latest.status = 'キーマン再コール'
      and (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = latest.item_id
      )
      and nullif((latest.memo::jsonb)->>'recall_date', '') is not null
      and coalesce(nullif((latest.memo::jsonb)->>'recall_completed', ''), 'false')::boolean = false
      and ((latest.memo::jsonb)->>'recall_date' || 'T'
            || coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00')
            || ':00+09:00')::timestamptz < now()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', record_id, 'list_id', list_id, 'item_id', item_id,
    'company', company, 'list_name', list_name,
    'recall_date', recall_date, 'recall_time', recall_time,
    'assignee', assignee, 'getter_name', getter_name, 'called_at', called_at
  ) order by _recall_at asc), '[]'::jsonb)
  from filtered;
$function$;
