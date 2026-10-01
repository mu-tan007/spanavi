-- CW送信ボット v3.4 の「メッセージ画面の構造調査」の受け皿。
-- 返信の読み取り機能を作るため、発注者のメッセージ画面の形（URL・リンク・タグ構造）だけを受け取る。
-- 文字はボット側で「[文字数]」に置き換え済みで、本文や名前は入らない。
create table if not exists public.cw_bot_probes (
  id bigint generated always as identity primary key,
  license_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cw_bot_probes_created on public.cw_bot_probes (created_at desc);

alter table public.cw_bot_probes enable row level security;
drop policy if exists cw_bot_probes_admin_select on public.cw_bot_probes;
create policy cw_bot_probes_admin_select on public.cw_bot_probes for select to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));
