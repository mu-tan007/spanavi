-- =====================================================================
-- call_lists.is_prospecting 追加
-- ---------------------------------------------------------------------
-- 経緯:
--   自社 (M&Aソーシングパートナーズ) を「クライアント」とする新規開拓用
--   call_list が既存にあるが、これらは外部クライアントへの請求対象外で
--   売上集計から除外する必要がある。今までリスト名末尾の「(新規開拓)」
--   表記で区別していたが、運用フラグとして DB に持つ。
--
-- 変更:
--   1) is_prospecting boolean カラム追加（default false）
--   2) 既存「(新規開拓)」付きリストを is_prospecting=true に移行し、
--      name から表記を除去（半角・全角括弧両対応）
--   3) 部分インデックス（true のみ）
-- =====================================================================

set local search_path = public, extensions;

alter table public.call_lists
  add column if not exists is_prospecting boolean not null default false;

update public.call_lists
   set is_prospecting = true,
       name = trim(regexp_replace(name, '\s*[(（]\s*新規開拓\s*[)）]\s*', '', 'g'))
 where name ~ '[(（]\s*新規開拓\s*[)）]';

create index if not exists call_lists_is_prospecting_idx
  on public.call_lists(is_prospecting)
  where is_prospecting = true;

comment on column public.call_lists.is_prospecting is
  '新規開拓リスト（自社向け）。true の場合、売上集計から除外しインターン報酬のみ計上。';
