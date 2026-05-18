set local search_path = public, extensions;

alter table public.call_lists
  add column if not exists company_url text;

comment on column public.call_lists.company_url is
  'クライアント企業のホームページURL。リスト編集モーダルでAI企業概要抽出の起点として使用';
