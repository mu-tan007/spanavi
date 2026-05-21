-- =====================================================================
-- 業務種別マスタ整備：matching active化 + client_acquisition新規追加
-- ---------------------------------------------------------------------
-- 経緯:
--   アポ取得報告フォーマットをリスト/業務種別単位で切り替える機能の前提として、
--   業務種別(engagement)の仕分けを正式化する必要がある。
--
--   現状:
--     - 全call_listsが engagement = seller_sourcing に統一されている
--     - matching engagement は archived 状態（買い手マッチング業務未管理）
--     - 「クライアント開拓」業務は call_lists.is_prospecting boolean で表現
--
-- 変更:
--   1) engagements.type の CHECK 制約に 'client_acquisition' を追加
--   2) matching engagement を status = 'active' に戻す
--   3) client_acquisition engagement を MASP org に新規作成
--      display name「クライアント開拓」
--
-- 注記:
--   is_prospecting フラグは「売上集計除外・インターン報酬のみ計上」ロジック
--   互換性のため併存維持する。engagement = client_acquisition は
--   「業務種別としての分類」、is_prospecting は「売上集計フラグ」と役割分担。
-- =====================================================================

set local search_path = public, extensions;

-- 1) CHECK制約を更新（client_acquisition を許容）
alter table public.engagements
  drop constraint if exists engagements_type_check;

alter table public.engagements
  add constraint engagements_type_check
  check (type in (
    'seller_sourcing',
    'matching',
    'client_acquisition',
    'spartia_career',
    'spartia_recruitment',
    'spanavi',
    'spartia_capital'
  ));

-- 2) matching engagement を active 化
update public.engagements
   set status = 'active',
       updated_at = now()
 where slug = 'matching'
   and status <> 'active';

-- 3) client_acquisition engagement を MASP org に新規作成
-- MASP org_id = 'a0000000-0000-0000-0000-000000000001'
insert into public.engagements (
  org_id, name, slug, type, status, display_order, description
)
select
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'クライアント開拓',
  'client_acquisition',
  'client_acquisition',
  'active',
  3,
  '自社の新規クライアント開拓（M&A仲介依頼の引き合い獲得等）。is_prospecting フラグで売上集計除外。'
where not exists (
  select 1 from public.engagements
   where org_id = 'a0000000-0000-0000-0000-000000000001'::uuid
     and slug = 'client_acquisition'
);

-- 確認用コメント
comment on constraint engagements_type_check on public.engagements is
  '営業代行系: seller_sourcing(売り手ソーシング) / matching(買い手マッチング) / client_acquisition(クライアント開拓) / 自社別事業: spartia_career / spartia_recruitment / spanavi / spartia_capital';
