-- =====================================================================
-- (1) refresh_smart_queue_mvs RPC: アーカイブ/復元など即時反映用
-- (2) smart_queue_keyman_rejections の同名重複を LATERAL で解消
-- =====================================================================

set local search_path = public, extensions;

-- (1) スマートキュー mv 即時 refresh RPC
create or replace function public.refresh_smart_queue_mvs()
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  refresh materialized view concurrently public.mv_excluded_items;
  refresh materialized view concurrently public.mv_latest_call_records;
  refresh materialized view concurrently public.mv_smart_queue_base;
end;
$function$;

grant execute on function public.refresh_smart_queue_mvs() to authenticated;

-- (2) キーマン断り一覧の company_master 同名重複対策
create or replace function public.smart_queue_keyman_rejections(
  p_engagement_id uuid default null,
  p_offset int default 0,
  p_limit int default 100
)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
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
           extract(epoch from (now() - lr.called_at)) / 86400.0 as days_since_reject
    from latest_reject lr
    join call_lists cl on cl.id = lr.list_id
    left join call_list_items cli on cli.id = lr.item_id
    -- company_master 同名重複でカルテシアン爆発するため LATERAL + limit 1
    left join lateral (
      select industry_major, prefecture, revenue_k
      from company_master
      where company_name = cli.company
      limit 1
    ) cm on true
    left join engagements e on e.id = cl.engagement_id
    left join mv_latest_call_records mlc on mlc.item_id = lr.item_id
    where (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = lr.item_id
      )
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
