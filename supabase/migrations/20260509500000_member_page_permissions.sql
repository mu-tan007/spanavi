-- ============================================================
-- member_page_permissions: メンバーごとのページ閲覧権限（ホワイトリスト）
-- 事業タブ閲覧権は MASP > Members の所属チェックボックス（member_engagements）が唯一のソース。
-- 本テーブルはサイドバーのページ単位ホワイトリスト。
-- 未登録のページはそのメンバーには表示されない（adminは常に全閲覧でバイパス）。
-- MASP（全社）は admin 専用ハードコードのため、本テーブルでは扱わない。
-- ============================================================

set local search_path = public, extensions;

create table if not exists public.member_page_permissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  engagement_slug text not null,
  page_key text not null,
  created_at timestamptz not null default now(),
  unique (member_id, engagement_slug, page_key)
);

create index if not exists idx_mpp_member on public.member_page_permissions(member_id);
create index if not exists idx_mpp_org on public.member_page_permissions(org_id);
create index if not exists idx_mpp_lookup on public.member_page_permissions(member_id, engagement_slug);

alter table public.member_page_permissions enable row level security;

-- 自組織内なら誰でも select 可能（自分の権限を読むため）
drop policy if exists mpp_select on public.member_page_permissions;
create policy mpp_select on public.member_page_permissions
  for select to authenticated
  using (org_id = public.get_user_org_id());

-- 書き込みは admin のみ（users.role = 'admin'）
drop policy if exists mpp_admin_insert on public.member_page_permissions;
create policy mpp_admin_insert on public.member_page_permissions
  for insert to authenticated
  with check (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.users where users.id = auth.uid() and users.role = 'admin'
    )
  );

drop policy if exists mpp_admin_update on public.member_page_permissions;
create policy mpp_admin_update on public.member_page_permissions
  for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.users where users.id = auth.uid() and users.role = 'admin'
    )
  );

drop policy if exists mpp_admin_delete on public.member_page_permissions;
create policy mpp_admin_delete on public.member_page_permissions
  for delete to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.users where users.id = auth.uid() and users.role = 'admin'
    )
  );

comment on table public.member_page_permissions is
  'メンバー × 事業slug × ページキー のホワイトリスト。adminは判定をバイパス。';

-- ============================================================
-- ページキー定数（フロントの src/constants/pageRegistry.js と同期）
-- backfill / トリガーで使うため一時関数として保持
-- ============================================================
create or replace function public._all_page_keys()
returns table(engagement_slug text, page_key text)
language sql
immutable
as $$
  values
    -- seller_sourcing
    ('seller_sourcing', 'dashboard'),
    ('seller_sourcing', 'lists'),
    ('seller_sourcing', 'search'),
    ('seller_sourcing', 'live'),
    ('seller_sourcing', 'recall'),
    ('seller_sourcing', 'incoming'),
    ('seller_sourcing', 'appo'),
    ('seller_sourcing', 'precheck'),
    ('seller_sourcing', 'deals'),
    ('seller_sourcing', 'stats'),
    ('seller_sourcing', 'library'),
    ('seller_sourcing', 'edu_roleplay'),
    ('seller_sourcing', 'members'),
    ('seller_sourcing', 'crm'),
    ('seller_sourcing', 'payroll'),
    ('seller_sourcing', 'shift'),
    -- spartia_career / スパキャリ (現在 enabled のみ)
    ('spartia_career', 'applications'),
    ('spartia_career', 'deals_career'),
    ('spartia_career', 'members_career')
$$;

-- ============================================================
-- backfill: 既存 active メンバーに「所属事業の全ページ」許可を付与
-- ============================================================

insert into public.member_page_permissions (org_id, member_id, engagement_slug, page_key)
select m.org_id, m.id, p.engagement_slug, p.page_key
from public.members m
join public.member_engagements me on me.member_id = m.id
join public.engagements e on e.id = me.engagement_id
join public._all_page_keys() p on p.engagement_slug = e.slug
where m.is_active = true
on conflict (member_id, engagement_slug, page_key) do nothing;

-- ============================================================
-- 事業所属（member_engagements）追加時にその事業の全ページを自動付与
-- 新規メンバー単独の挿入時は何もしない（事業所属が無い段階では付与すべきページが無い）。
-- ============================================================
create or replace function public.fn_grant_engagement_pages()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e_slug text;
begin
  select slug into e_slug from public.engagements where id = new.engagement_id;
  if e_slug is null then
    return new;
  end if;
  insert into public.member_page_permissions (org_id, member_id, engagement_slug, page_key)
  select new.org_id, new.member_id, p.engagement_slug, p.page_key
  from public._all_page_keys() p
  where p.engagement_slug = e_slug
  on conflict (member_id, engagement_slug, page_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_grant_engagement_pages on public.member_engagements;
create trigger trg_grant_engagement_pages
  after insert on public.member_engagements
  for each row
  execute function public.fn_grant_engagement_pages();
