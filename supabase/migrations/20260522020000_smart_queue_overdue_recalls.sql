-- =====================================================================
-- スマートキュー: 期限超過再コール（リスト跨ぎ横断）
-- ---------------------------------------------------------------------
-- 経緯:
--   架電リストページに「スマートキュー」タブを設け、ベテランがリストを
--   跨いで美味しい案件を効率的に拾えるようにする。
--   サブタブA: 期限超過の受付/キーマン再コール（AI不要）
--
--   既存の dashboard_overdue_reception_recalls / dashboard_overdue_recalls
--   と同じデータソース（latest = 各 item の最新call_record）から、
--   両ステータスを統合し、商材/タイプ/業種付きで返す。
-- =====================================================================

set local search_path = public, extensions;

create or replace function public.smart_queue_overdue_recalls(
  p_engagement_id uuid default null,
  p_status text default null  -- '受付再コール' | 'キーマン再コール' | null(両方)
)
returns jsonb
language sql
stable security definer
set search_path to 'public'
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
      latest.id as record_id,
      latest.list_id,
      latest.item_id,
      latest.status,
      cli.company,
      cli.phone,
      cli.business as item_business,
      cm.industry_major,
      cm.industry_sub,
      cm.prefecture,
      cl.name as list_name,
      cl.engagement_id,
      e.name as engagement_name,
      e.slug as engagement_slug,
      e.product_id,
      p.name as product_name,
      (latest.memo::jsonb)->>'recall_date' as recall_date,
      coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00') as recall_time,
      (latest.memo::jsonb)->>'assignee' as assignee,
      latest.getter_name,
      latest.called_at,
      ((latest.memo::jsonb)->>'recall_date'
        || 'T'
        || coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz as _recall_at,
      -- 期限超過日数（古いほど大きい値）
      extract(epoch from (now() - ((latest.memo::jsonb)->>'recall_date'
        || 'T'
        || coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz)) / 86400.0 as overdue_days
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join call_list_items cli on cli.id = latest.item_id
    left join company_master cm on cm.company_name = cli.company
    left join engagements e on e.id = cl.engagement_id
    left join products p on p.id = e.product_id
    where latest.status in ('受付再コール', 'キーマン再コール')
      and (cl.is_archived is null or cl.is_archived = false)
      and nullif((latest.memo::jsonb)->>'recall_date', '') is not null
      and coalesce(nullif((latest.memo::jsonb)->>'recall_completed', ''), 'false')::boolean = false
      and ((latest.memo::jsonb)->>'recall_date'
        || 'T'
        || coalesce(nullif((latest.memo::jsonb)->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz < now()
      and (p_engagement_id is null or cl.engagement_id = p_engagement_id)
      and (p_status is null or latest.status = p_status)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'record_id',       record_id,
      'list_id',         list_id,
      'item_id',         item_id,
      'status',          status,
      'company',         company,
      'phone',           phone,
      'business',        item_business,
      'industry',        industry_major,
      'industry_sub',    industry_sub,
      'prefecture',      prefecture,
      'list_name',       list_name,
      'engagement_id',   engagement_id,
      'engagement_name', engagement_name,
      'engagement_slug', engagement_slug,
      'product_id',      product_id,
      'product_name',    product_name,
      'recall_date',     recall_date,
      'recall_time',     recall_time,
      'assignee',        assignee,
      'getter_name',     getter_name,
      'called_at',       called_at,
      'overdue_days',    round(overdue_days::numeric, 1)
    ) order by _recall_at asc
  ), '[]'::jsonb)
  from filtered;
$function$;

grant execute on function public.smart_queue_overdue_recalls(uuid, text) to authenticated;
