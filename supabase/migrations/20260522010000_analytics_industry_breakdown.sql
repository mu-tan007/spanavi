-- =====================================================================
-- 業種別分析 RPC（TSR 大分類 / 細分類）
-- ---------------------------------------------------------------------
-- 経緯:
--   リスト単位ではなく企業単位で「どの業種が曜日・時間帯につながりやすいか」
--   「キーマン接続率・アポ獲得率」を集計する。
--   company_master の TSR 由来 industry_major / industry_sub を使用。
--   call_list_items.company と company_master.company_name で name JOIN
--   （現状約 86% マッチ）。
-- =====================================================================

set local search_path = public, extensions;

create or replace function public.analytics_industry_summary(p_level text default 'major')
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  status_map(label, keyman) as (
    values
      ('不通', false), ('キーマン不在', false), ('受付ブロック', false),
      ('受付再コール', false), ('キーマン再コール', true), ('アポ獲得', true),
      ('キーマン断り', true), ('問い合わせフォーム', false), ('除外', false)
  ),
  base as (
    select
      case when p_level = 'sub' then cm.industry_sub else cm.industry_major end as industry,
      cr.status,
      coalesce(sm.keyman, false) as keyman
    from public.call_records cr
    join public.call_list_items cli on cli.id = cr.item_id
    join public.company_master cm on cm.company_name = cli.company
    left join status_map sm on sm.label = cr.status
    where cr.org_id = (select org_id from my_org)
      and cm.industry_major is not null
  ),
  grouped as (
    select industry,
           count(*) as calls,
           count(*) filter (where keyman) as keyman_count,
           count(*) filter (where status = 'アポ獲得') as apo_count
    from base
    where industry is not null
    group by industry
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'industry',     industry,
      'calls',        calls,
      'keyman_count', keyman_count,
      'apo_count',    apo_count
    ) order by calls desc
  ), '[]'::jsonb)
  from grouped;
$function$;

grant execute on function public.analytics_industry_summary(text) to authenticated;

create or replace function public.analytics_industry_heatmap(
  p_level text default 'major',
  p_industry text default null
)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  status_map(label, keyman) as (
    values
      ('不通', false), ('キーマン不在', false), ('受付ブロック', false),
      ('受付再コール', false), ('キーマン再コール', true), ('アポ獲得', true),
      ('キーマン断り', true), ('問い合わせフォーム', false), ('除外', false)
  ),
  base as (
    select
      extract(dow from cr.called_at at time zone 'Asia/Tokyo')::int as dow,
      extract(hour from cr.called_at at time zone 'Asia/Tokyo')::int as hour,
      cr.status,
      coalesce(sm.keyman, false) as keyman,
      case when p_level = 'sub' then cm.industry_sub else cm.industry_major end as industry
    from public.call_records cr
    join public.call_list_items cli on cli.id = cr.item_id
    join public.company_master cm on cm.company_name = cli.company
    left join status_map sm on sm.label = cr.status
    where cr.org_id = (select org_id from my_org)
      and cm.industry_major is not null
      and cr.called_at is not null
  ),
  filtered as (
    select * from base
    where p_industry is null or industry = p_industry
  ),
  grouped as (
    select dow, hour,
           count(*) as calls,
           count(*) filter (where keyman) as keyman_count,
           count(*) filter (where status = 'アポ獲得') as apo_count
    from filtered
    group by dow, hour
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'dow',          dow,
      'hour',         hour,
      'calls',        calls,
      'keyman_count', keyman_count,
      'apo_count',    apo_count
    ) order by dow, hour
  ), '[]'::jsonb)
  from grouped;
$function$;

grant execute on function public.analytics_industry_heatmap(text, text) to authenticated;
