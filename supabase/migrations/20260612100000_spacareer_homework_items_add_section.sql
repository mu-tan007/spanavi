set local search_path = public, extensions;

-- ============================================================
-- 事後課題（spacareer_homework_items）に section 列を追加
-- ----------------------------------------------------------------
-- 第1回事後課題（STEP1〜7）の章立て見出しを保持するための列。
-- nullable。AI生成項目（第2〜8回）は section=null で見出しなし表示。
-- ============================================================

alter table public.spacareer_homework_items
  add column if not exists section text;

comment on column public.spacareer_homework_items.section is
  '設問の章立て見出し（例: STEP1：5年後の在り方）。受講生画面でセクション区切りに使う。null可。';
