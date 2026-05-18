-- =====================================================================
-- payroll_invoices テーブル作成
-- ---------------------------------------------------------------------
-- 経緯:
--   Payroll 詳細ページに「メンバー本人が自分の月別請求書 PDF/画像を
--   アップロード → 管理者・本人が閲覧」できるオブジェクト管理が必要。
--   実ファイルは Supabase Storage の payroll-invoices バケット、
--   メタデータ（アップ日時・サイズ・MIME等）を本テーブルで保持。
--
-- スコープ:
--   - member × pay_month で UNIQUE（差替時は同レコード upsert）
--   - RLS: 本人 (members.user_id = auth.uid()) と admin のみ SELECT
--   - 書込（INSERT/UPDATE/DELETE）は本人のみ
-- =====================================================================

set local search_path = public, extensions;

create table if not exists public.payroll_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null references public.members(id) on delete cascade,
  pay_month text not null check (pay_month ~ '^[0-9]{4}-[0-9]{2}$'),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes integer not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid,
  unique (org_id, member_id, pay_month)
);

create index if not exists payroll_invoices_member_month_idx
  on public.payroll_invoices(member_id, pay_month);

create index if not exists payroll_invoices_org_month_idx
  on public.payroll_invoices(org_id, pay_month);

alter table public.payroll_invoices enable row level security;

-- 本人 + admin のみ SELECT
drop policy if exists payroll_invoices_select on public.payroll_invoices;
create policy payroll_invoices_select on public.payroll_invoices
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      exists (
        select 1 from public.members m
        where m.id = payroll_invoices.member_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

-- 書込（INSERT/UPDATE/DELETE）は本人のみ
drop policy if exists payroll_invoices_insert on public.payroll_invoices;
create policy payroll_invoices_insert on public.payroll_invoices
  for insert to authenticated
  with check (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.id = payroll_invoices.member_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists payroll_invoices_update on public.payroll_invoices;
create policy payroll_invoices_update on public.payroll_invoices
  for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.id = payroll_invoices.member_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.id = payroll_invoices.member_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists payroll_invoices_delete on public.payroll_invoices;
create policy payroll_invoices_delete on public.payroll_invoices
  for delete to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (
      select 1 from public.members m
      where m.id = payroll_invoices.member_id
        and m.user_id = auth.uid()
    )
  );

comment on table public.payroll_invoices is
  'メンバー個別の月別給与請求書メタデータ。実ファイルは Storage bucket payroll-invoices。';
