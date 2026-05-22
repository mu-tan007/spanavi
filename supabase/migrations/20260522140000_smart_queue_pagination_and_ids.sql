-- =====================================================================
-- 特殊条件抽出 ①② を 200件/ページ + 全件 ID 軽量 RPC で高速化
-- ---------------------------------------------------------------------
-- 経緯:
--   ① キーマン断り一覧 7秒 / ② 業種×ステータス 18秒 と初回表示が遅い件、
--   大量行（数千〜数万）の jsonb_agg + JSON 転送が原因だった。
--
-- 対策:
--   1) 表示は LIMIT 200 / OFFSET 形式に戻す
--   2) 架電キュー用に「item_id+list_id だけ返す」ids RPC を追加
--      → 全件 fetch でも数十KB
--   3) ① はクライアントでやっていた getter/sort を RPC に移動
--      （ページ送りで正しく機能させるため）
--
-- 結果: 初回表示 1秒以内、 架電「次へ」で全件対象は維持
-- =====================================================================

set local search_path = public, extensions;

create or replace function public.smart_queue_keyman_rejections(
  p_engagement_id uuid default null,
  p_getter_names text[] default null,
  p_sort text default 'reject_asc',
  p_offset int default 0,
  p_limit int default 200
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
      and (p_getter_names is null or lr.getter_name = any(p_getter_names))
  ),
  ordered as (
    select * from base
    order by
      case when p_sort = 'reject_desc' then days_since_reject end desc nulls last,
      case when p_sort = 'reject_asc'  then days_since_reject end asc  nulls last,
      company asc
  ),
  page as (select * from ordered offset p_offset limit p_limit)
  select jsonb_build_object(
    'total', (select count(*) from base),
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
$function$;

-- ① ID-only 軽量版（架電キュー用、全件 fetch でも軽い）
create or replace function public.smart_queue_keyman_rejections_ids(
  p_engagement_id uuid default null,
  p_getter_names text[] default null,
  p_sort text default 'reject_asc'
)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  latest_reject as (
    select distinct on (cr.item_id)
      cr.item_id, cr.list_id, cr.called_at, cr.getter_name
    from call_records cr
    where cr.org_id = (select org_id from my_org) and cr.status = 'キーマン断り'
    order by cr.item_id, cr.round desc, cr.called_at desc
  ),
  base as (
    select lr.item_id, lr.list_id,
           extract(epoch from (now() - lr.called_at)) / 86400.0 as days_since_reject
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
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
      and (p_getter_names is null or lr.getter_name = any(p_getter_names))
  ),
  ordered as (
    select item_id, list_id from base
    order by
      case when p_sort = 'reject_desc' then days_since_reject end desc nulls last,
      case when p_sort = 'reject_asc'  then days_since_reject end asc  nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'list_id', list_id)), '[]'::jsonb)
  from ordered;
$function$;

-- ② ID-only 軽量版
create or replace function public.smart_queue_industry_status_combo_ids(
  p_industries text[] default null,
  p_statuses text[] default null,
  p_engagement_id uuid default null
)
returns jsonb language sql stable security definer set search_path to 'public'
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
    left join mv_industry_time_score mv
      on mv.org_id = mb.org_id
     and mv.industry_major = mb.industry_major
     and mv.dow = (select dow from now_slot)
     and mv.hour = (select hour from now_slot)
    where mb.org_id = (select org_id from my_org)
      and (p_engagement_id is null or mb.engagement_id = p_engagement_id)
      and (p_industries is null or mb.industry_major = any(p_industries))
      and (p_statuses is null or mb.status = any(p_statuses))
  )
  select coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'list_id', list_id)
    order by time_match_score desc), '[]'::jsonb)
  from base;
$function$;

grant execute on function public.smart_queue_keyman_rejections(uuid, text[], text, int, int) to authenticated;
grant execute on function public.smart_queue_keyman_rejections_ids(uuid, text[], text) to authenticated;
grant execute on function public.smart_queue_industry_status_combo_ids(text[], text[], uuid) to authenticated;
