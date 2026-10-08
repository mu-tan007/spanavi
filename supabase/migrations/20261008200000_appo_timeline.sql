-- このアポの経緯（2026-10-08 むー様）：クライアントとのやり取りの要約・クライアントからの依頼・面談後の結果を、
-- インターンも含めて全員が見られるようにする。原文ではなく要約だけ（条件・お金・他社の話は要約の段階で落とす）。
-- 取得・報告の送信・事前確認・リスケ／キャンセルは、アポと事前確認の記録から画面側で並べる。
create table if not exists public.appo_timeline (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  at timestamptz not null,
  kind text not null,          -- client_reply（クライアントとのやり取り）| client_request（クライアントからの依頼）| meeting_result（面談後の結果）
  text text not null,
  source_ref text,             -- 同じ返信を二度入れない
  created_at timestamptz not null default now(),
  unique (appointment_id, source_ref)
);
create index if not exists appo_timeline_appo_idx on public.appo_timeline (appointment_id, at);
alter table public.appo_timeline enable row level security;
create policy appo_timeline_select_own_org on public.appo_timeline for select to authenticated
  using (org_id = get_user_org_id() and not is_client_user());

-- クライアントの返信の扱い：tell_text（依頼）を確認待ちにし、むー様が「流す」と precheck_tell（クライアントからの依頼）に入る
alter table public.client_reply_relays add column if not exists summary text;
alter table public.client_reply_relays add column if not exists applied_at timestamptz;
