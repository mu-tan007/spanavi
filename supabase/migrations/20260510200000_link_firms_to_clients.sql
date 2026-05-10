-- Firms (cap_ma_agencies) と CRM clients を名前正規化で紐付け、
-- linked_client_id を自動で更新する仕組みを導入する。
--
-- 設計:
--   * cap_ma_agencies.linked_client_id (uuid, nullable) を追加
--   * normalize_company_name(text) 関数で表記揺れを吸収
--     (法人格除去 / 全角→半角 / &・アンド統一 / 記号空白除去 / 小文字統一)
--   * 既存データを一括同期 (clients.engagement の seller_sourcing のみ対象)
--   * フロント側はこのリンクを使って "取引先 / 接触済 / 未接触" の
--     派生ステータスを計算する。Firms 側の status カラム自体は触らない
--     (既存の手動 not_contacted/contacted 運用と独立)。
--
-- 注意: clients 変更時の自動再リンクは別 migration (Step 2) で trigger 追加する。

set local search_path = public, extensions;

-- ── 1. linked_client_id 列の追加 ────────────────────────────────────────────
alter table cap_ma_agencies
  add column if not exists linked_client_id uuid references clients(id) on delete set null;

create index if not exists idx_cap_ma_agencies_linked_client_id
  on cap_ma_agencies (linked_client_id)
  where linked_client_id is not null;

-- ── 2. 社名正規化関数 ──────────────────────────────────────────────────────
-- 表記揺れを最大限吸収するための正規化。
-- 結果: 小文字英数字 + 日本語のみ、空白・記号・カッコ・ハイフン除去、法人格除去
-- (既存の同名関数があると CREATE OR REPLACE では引数名変更不可のため一度 DROP する)
drop function if exists normalize_company_name(text);

create function normalize_company_name(s text)
returns text
language plpgsql
immutable
as $$
declare
  r text;
begin
  if s is null then return ''; end if;
  -- (1) 全角英数 → 半角、全角空白 → 半角空白
  r := translate(s,
    'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９　',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '
  );
  -- (2) 小文字統一
  r := lower(r);
  -- (3) 法人格 (前置/後置) を除去
  r := regexp_replace(r,
    '株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益財団法人|公益社団法人|特定非営利活動法人|学校法人|医療法人|社会福祉法人|宗教法人|相互会社|協同組合|税理士法人|弁護士法人|監査法人|司法書士法人|社会保険労務士法人|行政書士法人|\(株\)|（株）|\(有\)|（有）|\(同\)|（同）|\(財\)|（財）|\(社\)|（社）',
    '', 'g'
  );
  -- (4) &/＆/アンド/and の表記統一 → &
  r := regexp_replace(r, 'アンド|＆|and', '&', 'g');
  -- (5) ハイフン類を除去
  r := regexp_replace(r, '[‐−–—―ー－\-]', '', 'g');
  -- (6) 空白・中黒・カンマ・ピリオド・カッコ・引用符類を除去
  r := regexp_replace(r, '[\s・，,\.\(\)（）\[\]【】「」『』〈〉《》"''`]', '', 'g');
  return r;
end;
$$;

-- ── 3. 一括同期 (seller_sourcing engagement 配下の clients のみ対象) ────────
-- 既存の linked_client_id を全クリアしてから再計算。重複名 (1機関に複数 client がマッチ)
-- が稀にあった場合は最新の clients (created_at desc) を採用する。
update cap_ma_agencies set linked_client_id = null;

with
client_pool as (
  select c.id, c.name, c.created_at, normalize_company_name(c.name) as norm
  from clients c
  left join engagements e on e.id = c.engagement_id
  where e.slug = 'seller_sourcing' and c.name is not null
),
ranked as (
  select
    cm.id as agency_id,
    cp.id as client_id,
    row_number() over (
      partition by cm.id
      order by cp.created_at desc nulls last, cp.id
    ) as rn
  from cap_ma_agencies cm
  join client_pool cp on cp.norm = normalize_company_name(cm.name) and length(cp.norm) > 0
)
update cap_ma_agencies cm
set linked_client_id = r.client_id
from ranked r
where r.agency_id = cm.id and r.rn = 1;

-- ── 4. 結果サマリは migration ログには残さず、後で確認 SQL を実行する想定。
