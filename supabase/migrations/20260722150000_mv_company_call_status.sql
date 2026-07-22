-- 企業DB(company_master)の「架電ステータス」抽出フィルタ用の事前集約MV。
-- 検索時の関数評価を避けるため、ビルド時に company_master.id まで解決して保持する。
-- 検索フィルタは cm.id IN/EXISTS のハッシュ半/反結合になり、49万行への正規化関数評価が不要。
--
-- 突合キー: spanavi_norm_company(企業名) ＋ 電話数字(10桁以上) の両一致。
-- 「未架電」= そのキー配下に call_records が1件も無い item が存在する場合の擬似ラベル。
-- 「未登録」は company_master 側でこのMVに一致idが無いこと（NOT EXISTS）で判定するため行は持たない。
set local search_path = public, extensions;

create materialized view public.mv_company_call_status as
with base as (
  select i.org_id,
         public.spanavi_norm_company(i.company) as nc,
         regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g') as np,
         i.id as item_id
  from public.call_list_items i
  where public.spanavi_norm_company(i.company) is not null
    and length(regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g')) >= 10
),
keyed as (
  select distinct b.org_id, b.nc, b.np, r.status as status_label
  from base b
  join public.call_records r on r.item_id = b.item_id
  where r.status is not null and r.status <> ''
  union
  select distinct b.org_id, b.nc, b.np, '未架電'::text as status_label
  from base b
  where not exists (select 1 from public.call_records r where r.item_id = b.item_id)
)
select distinct cm.id as company_master_id, k.org_id, k.status_label
from keyed k
join public.company_master cm
  on public.spanavi_norm_company(cm.company_name) = k.nc
 and regexp_replace(coalesce(cm.phone, ''), '[^0-9]', '', 'g') = k.np;

-- concurrently refresh 用のユニークインデックス
create unique index mv_ccs_uniq on public.mv_company_call_status (company_master_id, org_id, status_label);
-- ステータス絞り込みのハッシュ構築側
create index mv_ccs_org_status on public.mv_company_call_status (org_id, status_label, company_master_id);
-- 未登録(NOT EXISTS)判定・id結合用
create index mv_ccs_org_cm on public.mv_company_call_status (org_id, company_master_id);

comment on materialized view public.mv_company_call_status is
  '企業DB架電ステータス抽出用。ビルド時にcompany_master.idまで解決済み(org_id,company_master_id,status_label)。未架電含む。未登録はMV不在で判定。';