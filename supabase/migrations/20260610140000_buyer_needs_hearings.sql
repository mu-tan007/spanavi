set local search_path = public, extensions;

-- 買い手マッチング ニーズヒアリング（買収ニーズの蓄積）
-- アポとは独立した実績。org単位の共有プール。
-- ポリシーが参照するため clients.is_buyer_matching 列を先に追加する
alter table public.clients add column if not exists is_buyer_matching boolean not null default false;

create table if not exists public.buyer_needs_hearings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  company_name     text not null,            -- アプローチ先（誰にヒアリングしたか）
  industry         text,
  area             text,
  revenue          text,
  operating_profit text,
  budget           text,
  purpose          text,
  memo             text,                      -- 買収ニーズ7項目
  getter_name      text,                      -- ヒアリングした担当者名
  hearing_date     date default current_date,
  list_id          uuid,
  item_id          uuid,
  recording_url    text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists buyer_needs_hearings_org_idx
  on public.buyer_needs_hearings(org_id, created_at desc);

alter table public.buyer_needs_hearings enable row level security;

-- 社内メンバー: 自org内で全操作
drop policy if exists "bnh_internal_all" on public.buyer_needs_hearings;
create policy "bnh_internal_all" on public.buyer_needs_hearings
  for all using (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

-- ポータル: 買い手マッチング契約クライアントが自org分を閲覧
drop policy if exists "bnh_portal_select" on public.buyer_needs_hearings;
create policy "bnh_portal_select" on public.buyer_needs_hearings
  for select using (exists (
    select 1 from public.clients c
    where c.auth_user_id = auth.uid() and c.is_buyer_matching = true
      and c.org_id = buyer_needs_hearings.org_id
  ));
