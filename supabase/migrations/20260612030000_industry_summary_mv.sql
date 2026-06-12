set local search_path = public, extensions;

-- 業種別集計をMV化（2026-06-12、本番適用済み）。
-- 旧RPCは company_master(49万) を社名文字列JOINして44秒→フロントtimeoutで空表示。
-- MVに org×level×industry の集計を保持し、RPCはMV読み取り（数ms）。日次refresh。
create materialized view if not exists public.mv_industry_summary as
with status_map(label, keyman) as (
  values ('不通',false),('キーマン不在',false),('受付ブロック',false),('受付再コール',false),
         ('キーマン再コール',true),('アポ獲得',true),('キーマン断り',true),
         ('問い合わせフォーム',false),('除外',false)
),
base as (
  select cr.org_id, cm.industry_major, cm.industry_sub, cr.status, coalesce(sm.keyman,false) as keyman
  from public.call_records cr
  join public.call_list_items cli on cli.id = cr.item_id
  join public.company_master cm on cm.company_name = cli.company
  left join status_map sm on sm.label = cr.status
  where cm.industry_major is not null
)
select org_id, 'major'::text as level, industry_major as industry,
       count(*) as calls, count(*) filter (where keyman) as keyman_count,
       count(*) filter (where status='アポ獲得') as apo_count
from base where industry_major is not null group by org_id, industry_major
union all
select org_id, 'sub'::text as level, industry_sub as industry,
       count(*) as calls, count(*) filter (where keyman) as keyman_count,
       count(*) filter (where status='アポ獲得') as apo_count
from base where industry_sub is not null group by org_id, industry_sub
with no data;

create index if not exists mv_industry_summary_idx on public.mv_industry_summary(org_id, level, calls desc);

create or replace function public.analytics_industry_summary(p_level text default 'major')
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(
    jsonb_build_object('industry', industry, 'calls', calls,
                       'keyman_count', keyman_count, 'apo_count', apo_count)
    order by calls desc), '[]'::jsonb)
  from public.mv_industry_summary
  where org_id = get_user_org_id() and level = p_level;
$function$;

-- refresh関数: cronのデフォルトtimeout(120s)を関数属性で上書き（refreshは~90s）
create or replace function public.refresh_mv_industry_summary()
returns void language plpgsql security definer
set search_path to 'public' set statement_timeout to '8min'
as $$ begin refresh materialized view public.mv_industry_summary; end; $$;

-- 日次refresh（深夜2:30 JST）
select cron.schedule('refresh_industry_summary', '30 17 * * *',
  $$select public.refresh_mv_industry_summary()$$);
