-- MASP Firms 自然言語検索チャット用テーブル + 保存検索
-- chat-to-filter-agency Edge Function とフロント (AgencyChatPanel) が利用する。
-- DatabaseView の database_chat_sessions / database_chat_messages / saved_company_searches と同パターン。

set local search_path = public, extensions;

-- 1) チャットセッション
create table if not exists masp_chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_masp_chat_sessions_user_id
  on masp_chat_sessions (user_id, updated_at desc);

alter table masp_chat_sessions enable row level security;

drop policy if exists masp_chat_sessions_owner on masp_chat_sessions;
create policy masp_chat_sessions_owner on masp_chat_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2) チャットメッセージ
create table if not exists masp_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references masp_chat_sessions(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  filters     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_masp_chat_messages_session_id
  on masp_chat_messages (session_id, created_at);

alter table masp_chat_messages enable row level security;

drop policy if exists masp_chat_messages_via_session on masp_chat_messages;
create policy masp_chat_messages_via_session on masp_chat_messages
  for all to authenticated
  using (
    exists (
      select 1 from masp_chat_sessions s
      where s.id = masp_chat_messages.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from masp_chat_sessions s
      where s.id = masp_chat_messages.session_id
        and s.user_id = auth.uid()
    )
  );

-- 3) 保存検索
create table if not exists saved_agency_searches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  filters     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_saved_agency_searches_user_id
  on saved_agency_searches (user_id, created_at desc);

alter table saved_agency_searches enable row level security;

drop policy if exists saved_agency_searches_owner on saved_agency_searches;
create policy saved_agency_searches_owner on saved_agency_searches
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- updated_at トリガー (sessions のみ)
create or replace function masp_chat_sessions_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_masp_chat_sessions_touch on masp_chat_sessions;
create trigger trg_masp_chat_sessions_touch
  before update on masp_chat_sessions
  for each row execute function masp_chat_sessions_touch();
