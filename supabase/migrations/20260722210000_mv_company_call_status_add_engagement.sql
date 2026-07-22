-- 「商材×タイプ×架電ステータス」抽出のため、MVに engagement(=タイプ) 次元を追加。
-- タイプ = engagement（売り手ソーシング/買い手マッチング/クライアント開拓/リード獲得 等）。
-- category_id(商材)も従来通り保持。engagement/category 未設定はゼロUUIDに寄せる。
-- 注: このMVビルドは company_master(49万) との突合で重い(数分)。MCP経由はタイムアウトで
--     ロールバックするため psql 等で実行すること。
set local search_path = public, extensions;
set local statement_timeout = 0;
-- company_master(49万)との突合は関数インデックス idx_cm_normname_phone 経由の
-- ネステッドループにすると数十秒で完了する（ハッシュ結合だと全行に正規化関数評価で数分）。
set local enable_hashjoin = off;
set local enable_mergejoin = off;

drop materialized view if exists public.mv_company_call_status;

create materialized view public.mv_company_call_status as
with base as (
  select i.org_id,
         coalesce(e.category_id, '00000000-0000-0000-0000-000000000000'::uuid) as category_id,
         coalesce(cl.engagement_id, '00000000-0000-0000-0000-000000000000'::uuid) as engagement_id,
         public.spanavi_norm_company(i.company) as nc,
         regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g') as np,
         i.id as item_id
  from public.call_list_items i
  join public.call_lists cl on cl.id = i.list_id
  left join public.engagements e on e.id = cl.engagement_id
  where public.spanavi_norm_company(i.company) is not null
    and length(regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g')) >= 10
),
keyed as (
  select distinct b.org_id, b.category_id, b.engagement_id, b.nc, b.np, r.status as status_label
  from base b
  join public.call_records r on r.item_id = b.item_id
  where r.status is not null and r.status <> ''
  union
  select distinct b.org_id, b.category_id, b.engagement_id, b.nc, b.np, '未架電'::text as status_label
  from base b
  where not exists (select 1 from public.call_records r where r.item_id = b.item_id)
)
select distinct cm.id as company_master_id, k.org_id, k.category_id, k.engagement_id, k.status_label
from keyed k
join public.company_master cm
  on public.spanavi_norm_company(cm.company_name) = k.nc
 and regexp_replace(coalesce(cm.phone, ''), '[^0-9]', '', 'g') = k.np;

create unique index mv_ccs_uniq on public.mv_company_call_status (company_master_id, org_id, category_id, engagement_id, status_label);
create index mv_ccs_org_status on public.mv_company_call_status (org_id, status_label, company_master_id);
create index mv_ccs_org_cat_status on public.mv_company_call_status (org_id, category_id, status_label, company_master_id);
create index mv_ccs_org_eng_status on public.mv_company_call_status (org_id, engagement_id, status_label, company_master_id);
create index mv_ccs_org_cm on public.mv_company_call_status (org_id, company_master_id);

comment on materialized view public.mv_company_call_status is
  '企業DB架電ステータス抽出用。(org,company_master_id,category_id=商材,engagement_id=タイプ,status_label)。未架電含む。id解決済み。';

-- リフレッシュcron再登録（concurrent refresh も index経由の高速プランになるよう hint を付与）
select cron.schedule(
  'refresh_mv_company_call_status_15min',
  '11-59/15 * * * *',
  $$ SET statement_timeout='4min'; SET enable_hashjoin=off; SET enable_mergejoin=off; SELECT public.refresh_mv_company_call_status(); $$
);
