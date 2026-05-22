-- =====================================================================
-- キーマン断り一覧に「温度感フィルタ」 p_temps text[] を追加
--   ['HIGH','MEDIUM','LOW','UNCERTAIN'] の配列。 NULL なら絞り込みなし
--   UNCERTAIN = 未判定（rejection_reason に HIGH/MEDIUM/LOW プレフィックスがないもの）
-- 対象: smart_queue_keyman_rejections / smart_queue_keyman_rejections_ids
-- =====================================================================

set local search_path = public, extensions;

create or replace function public.smart_queue_keyman_rejections(
  p_engagement_id  uuid default null,
  p_getter_names   text[] default null,
  p_sort           text default 'reject_asc',
  p_offset         integer default 0,
  p_limit          integer default 200,
  p_engagement_ids uuid[] default null,
  p_temps          text[] default null
)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with my_org as (select get_user_org_id() as org_id),
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
           extract(epoch from (now() - lr.called_at)) / 86400.0 as days_since_reject,
           coalesce(
             nullif(upper(substring(coalesce(lr.rejection_reason,'') from '^(HIGH|MEDIUM|LOW)')), ''),
             'UNCERTAIN'
           ) as temp_label,
           case upper(substring(coalesce(lr.rejection_reason,'') from '^(HIGH|MEDIUM|LOW)'))
             when 'HIGH'   then 3
             when 'MEDIUM' then 2
             when 'LOW'    then 1
             else 0
           end as temp_score
    from latest_reject lr
    join call_lists cl on cl.id = lr.list_id
    left join call_list_items cli on cli.id = lr.item_id
    left join lateral (
      select industry_major, prefecture, revenue_k
      from company_master where company_name = cli.company limit 1
    ) cm on true
    left join engagements e on e.id = cl.engagement_id
    left join mv_latest_call_records mlc on mlc.item_id = lr.item_id
    where (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = lr.item_id
      )
      and coalesce(mlc.status, '') not in ('受付再コール','キーマン再コール')
      and (p_engagement_id  is null or cl.engagement_id = p_engagement_id)
      and (p_engagement_ids is null or cl.engagement_id = any(p_engagement_ids))
      and (p_getter_names   is null or lr.getter_name   = any(p_getter_names))
  ),
  filtered as (
    select * from base where (p_temps is null or temp_label = any(p_temps))
  ),
  ordered as (
    select * from filtered
    order by
      case when p_sort = 'temp_desc'   then temp_score        end desc nulls last,
      case when p_sort = 'temp_asc'    then temp_score        end asc  nulls last,
      case when p_sort = 'reject_desc' then days_since_reject end desc nulls last,
      case when p_sort = 'reject_asc'  then days_since_reject end asc  nulls last,
      days_since_reject asc,
      company asc
  ),
  page as (select * from ordered offset p_offset limit p_limit)
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'getters', (select coalesce(jsonb_agg(distinct getter_name order by getter_name)
                                 filter (where getter_name is not null), '[]'::jsonb) from base),
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
$$;

create or replace function public.smart_queue_keyman_rejections_ids(
  p_engagement_id  uuid default null,
  p_getter_names   text[] default null,
  p_sort           text default 'reject_asc',
  p_engagement_ids uuid[] default null,
  p_temps          text[] default null
)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with my_org as (select get_user_org_id() as org_id),
  latest_reject as (
    select distinct on (cr.item_id) cr.item_id, cr.list_id, cr.called_at, cr.getter_name, cr.rejection_reason
    from call_records cr
    where cr.org_id = (select org_id from my_org) and cr.status = 'キーマン断り'
    order by cr.item_id, cr.round desc, cr.called_at desc
  ),
  base as (
    select lr.item_id, lr.list_id,
           extract(epoch from (now() - lr.called_at)) / 86400.0 as days_since_reject,
           coalesce(
             nullif(upper(substring(coalesce(lr.rejection_reason,'') from '^(HIGH|MEDIUM|LOW)')), ''),
             'UNCERTAIN'
           ) as temp_label,
           case upper(substring(coalesce(lr.rejection_reason,'') from '^(HIGH|MEDIUM|LOW)'))
             when 'HIGH'   then 3
             when 'MEDIUM' then 2
             when 'LOW'    then 1
             else 0
           end as temp_score
    from latest_reject lr
    join call_lists cl on cl.id = lr.list_id
    where (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = lr.item_id
      )
      and not exists (
        select 1 from mv_latest_call_records mlc
         where mlc.item_id = lr.item_id
           and mlc.status in ('受付再コール','キーマン再コール')
      )
      and (p_engagement_id  is null or cl.engagement_id = p_engagement_id)
      and (p_engagement_ids is null or cl.engagement_id = any(p_engagement_ids))
      and (p_getter_names   is null or lr.getter_name   = any(p_getter_names))
  ),
  filtered as (
    select * from base where (p_temps is null or temp_label = any(p_temps))
  ),
  ordered as (
    select item_id, list_id from filtered
    order by
      case when p_sort = 'temp_desc'   then temp_score        end desc nulls last,
      case when p_sort = 'temp_asc'    then temp_score        end asc  nulls last,
      case when p_sort = 'reject_desc' then days_since_reject end desc nulls last,
      case when p_sort = 'reject_asc'  then days_since_reject end asc  nulls last,
      days_since_reject asc
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'list_id', list_id)), '[]'::jsonb)
  from ordered;
$$;
