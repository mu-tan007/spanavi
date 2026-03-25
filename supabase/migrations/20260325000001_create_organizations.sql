-- ============================================================
-- organizations テーブル作成
-- テナント（組織）情報を管理する
-- ============================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now(),
  is_active boolean default true
);

-- RLS 有効化
alter table public.organizations enable row level security;

-- 認証ユーザーは自組織のみ参照可能
create policy "org_select_own"
  on public.organizations
  for select
  to authenticated
  using (id = public.get_user_org_id());

-- 既存の組織を初期データとして挿入
insert into public.organizations (id, name, slug)
values ('a0000000-0000-0000-0000-000000000001', 'MASP', 'masp')
on conflict (id) do nothing;
