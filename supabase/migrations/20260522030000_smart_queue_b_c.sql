-- =====================================================================
-- スマートキュー: サブタブB(未接続フォロー) / サブタブC(新規開拓)
-- ---------------------------------------------------------------------
-- 共通スコア:
--   各企業の業種(industry_major) × 現在の曜日/時間帯 における
--   過去60日間の接続率(分母: 全架電数, 分子: キーマン接続を伴うステータス数)
--   を 0-100 で算出し、降順に並べる。
--
-- ベテランが「今かければ当たる」業種から効率的に拾えるようにする。
-- =====================================================================

set local search_path = public, extensions;

-- ───────────────────────────────────────────────────────────────────────
-- B: 未接続フォロー
--    最新ステータスが ['キーマン不在', '不通', '受付ブロック'] の企業を、
--    業種×現在時間帯接続率順で返す（上位500件）
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.smart_queue_unconnected_followup(
  p_engagement_id uuid default null,
  p_status text default null  -- null=全対象 / 'キーマン不在'|'不通'|'受付ブロック' で個別
)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  now_slot as (
    select
      extract(dow  from now() at time zone 'Asia/Tokyo')::int as dow,
      extract(hour from now() at time zone 'Asia/Tokyo')::int as hour
  ),
  status_map(label, keyman) as (
    values
      ('不通', false), ('キーマン不在', false), ('受付ブロック', false),
      ('受付再コール', false), ('キーマン再コール', true), ('アポ獲得', true),
      ('キーマン断り', true), ('問い合わせフォーム', false), ('除外', false)
  ),
  industry_score as (
    -- 業種 × 曜日 × 時間帯 の接続率（全期間・アーカイブ含む全call_records）
    select
      cm.industry_major,
      extract(dow  from cr.called_at at time zone 'Asia/Tokyo')::int as dow,
      extract(hour from cr.called_at at time zone 'Asia/Tokyo')::int as hour,
      count(*) as total,
      count(*) filter (where coalesce(sm.keyman, false)) as connected
    from call_records cr
    join call_list_items cli on cli.id = cr.item_id
    join company_master cm on cm.company_name = cli.company
    left join status_map sm on sm.label = cr.status
    where cr.org_id = (select org_id from my_org)
      and cm.industry_major is not null
    group by 1, 2, 3
  ),
  latest as (
    select distinct on (item_id) *
    from call_records
    where org_id = (select org_id from my_org)
    order by item_id, round desc, called_at desc
  ),
  candidates as (
    select
      latest.id as record_id,
      latest.list_id,
      latest.item_id,
      latest.status,
      latest.called_at,
      latest.getter_name,
      cli.company,
      cli.phone,
      cm.industry_major,
      cm.prefecture,
      cl.name as list_name,
      cl.engagement_id,
      e.name as engagement_name,
      e.slug as engagement_slug,
      e.product_id,
      p.name as product_name,
      coalesce(
        (select round((100.0 * is_.connected / nullif(is_.total, 0))::numeric, 1)
           from industry_score is_, now_slot
          where is_.industry_major = cm.industry_major
            and is_.dow  = now_slot.dow
            and is_.hour = now_slot.hour),
        0
      ) as time_match_score,
      extract(epoch from (now() - latest.called_at)) / 86400.0 as days_since_call
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join call_list_items cli on cli.id = latest.item_id
    left join company_master cm on cm.company_name = cli.company
    left join engagements e on e.id = cl.engagement_id
    left join products p on p.id = e.product_id
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
      'record_id',        record_id,
      'list_id',          list_id,
      'item_id',          item_id,
      'status',           status,
      'company',          company,
      'phone',            phone,
      'industry',         industry_major,
      'prefecture',       prefecture,
      'list_name',        list_name,
      'engagement_id',    engagement_id,
      'engagement_name',  engagement_name,
      'engagement_slug',  engagement_slug,
      'product_id',       product_id,
      'product_name',     product_name,
      'getter_name',      getter_name,
      'called_at',        called_at,
      'days_since_call',  round(days_since_call::numeric, 1),
      'time_match_score', time_match_score
    ) order by time_match_score desc, days_since_call asc
  ), '[]'::jsonb)
  from top500;
$function$;

grant execute on function public.smart_queue_unconnected_followup(uuid, text) to authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- C: 新規開拓
--    未架電の call_list_items を、業種×現在時間帯接続率順で返す（上位500件）
-- ───────────────────────────────────────────────────────────────────────
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
    select
      extract(dow  from now() at time zone 'Asia/Tokyo')::int as dow,
      extract(hour from now() at time zone 'Asia/Tokyo')::int as hour
  ),
  status_map(label, keyman) as (
    values
      ('不通', false), ('キーマン不在', false), ('受付ブロック', false),
      ('受付再コール', false), ('キーマン再コール', true), ('アポ獲得', true),
      ('キーマン断り', true), ('問い合わせフォーム', false), ('除外', false)
  ),
  industry_score as (
    -- 業種 × 曜日 × 時間帯 の接続率（全期間・アーカイブ含む全call_records）
    select
      cm.industry_major,
      extract(dow  from cr.called_at at time zone 'Asia/Tokyo')::int as dow,
      extract(hour from cr.called_at at time zone 'Asia/Tokyo')::int as hour,
      count(*) as total,
      count(*) filter (where coalesce(sm.keyman, false)) as connected
    from call_records cr
    join call_list_items cli on cli.id = cr.item_id
    join company_master cm on cm.company_name = cli.company
    left join status_map sm on sm.label = cr.status
    where cr.org_id = (select org_id from my_org)
      and cm.industry_major is not null
    group by 1, 2, 3
  ),
  untouched as (
    select
      cli.id as item_id,
      cli.list_id,
      cli.company,
      cli.phone,
      cm.industry_major,
      cm.prefecture,
      cl.name as list_name,
      cl.engagement_id,
      e.name as engagement_name,
      e.slug as engagement_slug,
      e.product_id,
      p.name as product_name,
      coalesce(
        (select round((100.0 * is_.connected / nullif(is_.total, 0))::numeric, 1)
           from industry_score is_, now_slot
          where is_.industry_major = cm.industry_major
            and is_.dow  = now_slot.dow
            and is_.hour = now_slot.hour),
        0
      ) as time_match_score
    from call_list_items cli
    join call_lists cl on cl.id = cli.list_id
    left join company_master cm on cm.company_name = cli.company
    left join engagements e on e.id = cl.engagement_id
    left join products p on p.id = e.product_id
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
      'item_id',          item_id,
      'list_id',          list_id,
      'company',          company,
      'phone',            phone,
      'industry',         industry_major,
      'prefecture',       prefecture,
      'list_name',        list_name,
      'engagement_id',    engagement_id,
      'engagement_name',  engagement_name,
      'engagement_slug',  engagement_slug,
      'product_id',       product_id,
      'product_name',     product_name,
      'time_match_score', time_match_score
    ) order by time_match_score desc, company asc
  ), '[]'::jsonb)
  from top500;
$function$;

grant execute on function public.smart_queue_new_prospects(uuid) to authenticated;
