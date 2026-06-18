-- ============================================================
-- スパキャリ AI講座: 「専用配信」カテゴリー対応
-- ----------------------------------------------------------------
-- is_personal=true のカテゴリーは「受講生ごとの個別配信専用」ジャンル。
-- そのカテゴリーの動画は audience='assigned' で個別配信され、
-- 受講生画面では「{フルネーム}さん専用のAI講座」という見出しで表示される。
-- ============================================================
set local search_path = public, extensions;

alter table public.spacareer_course_categories
  add column if not exists is_personal boolean not null default false;

comment on column public.spacareer_course_categories.is_personal is
  '専用配信カテゴリー。trueの場合、受講生ごとに個別配信され、受講生画面では「{フルネーム}さん専用のAI講座」として表示される。';
