-- 自動の呼び出し（pg_cron→Edge Function）専用の合言葉。管理用の鍵をデータベースに置かずに、
-- 費用のかかる関数を cron から呼べるようにする（2026-10-07 話し方の分析の書き起こし）。
-- RLS を有効にして policy を置かない＝画面からは読めない。関数側は service role で照合する。
create table if not exists public.internal_cron_tokens (
  name text primary key,
  token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.internal_cron_tokens enable row level security;
revoke all on public.internal_cron_tokens from anon, authenticated;
insert into public.internal_cron_tokens (name) values ('transcribe-call-batch') on conflict do nothing;
