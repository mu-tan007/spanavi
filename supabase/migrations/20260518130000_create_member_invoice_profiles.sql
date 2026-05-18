-- =====================================================================
-- member_invoice_profiles: メンバー個別の請求書プロフィール
-- ---------------------------------------------------------------------
-- 経緯:
--   Payroll の「請求書を作成」機能で、振込先・住所・登録番号などをメンバー
--   ごとに保存。当初 localStorage に保存していたが、端末分断・引き継ぎ不可
--   のため DB に移行。同じメンバーがどの端末から請求書を作成しても
--   保存済みの口座情報が自動プレフィルされる。
--
-- スコープ:
--   - member_id を PK にして 1 メンバー 1 プロフィール
--   - 本人 (members.user_id = auth.uid()) のみ read/write
--   - admin は read のみ可（請求書欄に格納されたファイル閲覧の補助情報用）
-- =====================================================================

set local search_path = public, extensions;

create table if not exists public.member_invoice_profiles (
  member_id uuid primary key references public.members(id) on delete cascade,
  org_id uuid not null,
  postal_code text default '',
  address text default '',
  phone text default '',
  email text default '',
  tax_invoice_number text default '',
  bank_name text default '',
  branch_name text default '',
  account_type text default '普通' check (account_type in ('普通', '当座')),
  account_number text default '',
  account_holder_kana text default '',
  updated_at timestamptz not null default now()
);

create index if not exists member_invoice_profiles_org_idx
  on public.member_invoice_profiles(org_id);

alter table public.member_invoice_profiles enable row level security;

-- 本人 + admin のみ SELECT
drop policy if exists member_invoice_profiles_select on public.member_invoice_profiles;
create policy member_invoice_profiles_select on public.member_invoice_profiles
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      exists (
        select 1 from public.members m
        where m.id = member_invoice_profiles.member_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

-- 書込（INSERT/UPDATE/DELETE）は本人のみ
drop policy if exists member_invoice_profiles_insert on public.member_invoice_profiles;
create policy member_invoice_profiles_insert on public.member_invoice_profiles
  for insert to authenticated
  with check (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.id = member_invoice_profiles.member_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists member_invoice_profiles_update on public.member_invoice_profiles;
create policy member_invoice_profiles_update on public.member_invoice_profiles
  for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.id = member_invoice_profiles.member_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.id = member_invoice_profiles.member_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists member_invoice_profiles_delete on public.member_invoice_profiles;
create policy member_invoice_profiles_delete on public.member_invoice_profiles
  for delete to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.id = member_invoice_profiles.member_id
        and m.user_id = auth.uid()
    )
  );

comment on table public.member_invoice_profiles is
  'メンバー個別の請求書プロフィール（振込先・住所等）。Payroll の「請求書を作成」UIで使用。';
