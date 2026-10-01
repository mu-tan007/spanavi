-- サイト分析の取り込みに使う Google の更新トークン置き場。
-- 組織ポリシーでサービスアカウントの鍵が作れないため、むー様の Google アカウントで
-- 読み取りだけ（webmasters.readonly / analytics.readonly）を許可したトークンを使う。
-- 読み書きは Edge Function（service role）だけ。画面からは一切触れない。
create table if not exists public.google_oauth_tokens (
  name text primary key,
  refresh_token text,
  scopes text,
  pending_state text,           -- 許可画面に渡した state（取り違え防止。使ったら消す）
  updated_at timestamptz not null default now()
);
alter table public.google_oauth_tokens enable row level security;
revoke all on public.google_oauth_tokens from anon, authenticated;
