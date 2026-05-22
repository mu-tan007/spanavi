-- =====================================================================
-- Materialized View: 業種 × 曜日 × 時間帯 接続率
-- 集計対象: 全call_records（アーカイブリスト含む）
-- TSR業種(industry_major)が紐付くもののみ
-- キーマン接続を伴うステータス: キーマン再コール / アポ獲得 / キーマン断り
-- =====================================================================

set local search_path = public, extensions;

drop materialized view if exists public.mv_industry_time_score;

create materialized view public.mv_industry_time_score as
with status_map(label, keyman) as (
  values
    ('不通', false), ('キーマン不在', false), ('受付ブロック', false),
    ('受付再コール', false), ('キーマン再コール', true), ('アポ獲得', true),
    ('キーマン断り', true), ('問い合わせフォーム', false), ('除外', false)
)
select
  cr.org_id,
  cm.industry_major,
  extract(dow  from cr.called_at at time zone 'Asia/Tokyo')::int as dow,
  extract(hour from cr.called_at at time zone 'Asia/Tokyo')::int as hour,
  count(*)::bigint as total,
  count(*) filter (where coalesce(sm.keyman, false))::bigint as keyman_connected,
  round(
    100.0 * count(*) filter (where coalesce(sm.keyman, false))
    / nullif(count(*), 0)::numeric,
    2
  ) as keyman_rate
from public.call_records cr
join public.call_list_items cli on cli.id = cr.item_id
join public.company_master cm on cm.company_name = cli.company
left join status_map sm on sm.label = cr.status
where cm.industry_major is not null
group by cr.org_id, cm.industry_major, 3, 4;

create unique index if not exists mv_industry_time_score_pk
  on public.mv_industry_time_score (org_id, industry_major, dow, hour);

create index if not exists mv_industry_time_score_org_now
  on public.mv_industry_time_score (org_id, dow, hour);

grant select on public.mv_industry_time_score to authenticated;

refresh materialized view public.mv_industry_time_score;
