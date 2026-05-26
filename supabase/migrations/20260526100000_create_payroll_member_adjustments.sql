-- =====================================================================
-- payroll_member_adjustments: メンバー × 月 単位の任意調整項目
-- ---------------------------------------------------------------------
-- 経緯:
--   Payroll の請求書自動生成（インセンティブ/役職ボーナス/紹介料）に
--   入らないイレギュラー対応（特別ボーナス、研修費控除など）を
--   メンバー × 月 で複数行追加できるようにする。
--   既存 payroll_adjustments は org 全体の月次ディスカウントで別物。
--
-- スコープ:
--   - amount は正負どちらも可（ボーナス=正 / 控除=負）
--   - 本人 + admin の両方が CRUD 可
--   - 給与画面サマリーの合計支給額 + 請求書PDF明細 の両方に反映
-- =====================================================================

set local search_path = public, extensions;

create table if not exists public.payroll_member_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null references public.members(id) on delete cascade,
  pay_month text not null,
  label text not null,
  amount integer not null default 0,
  note text default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_member_adjustments_lookup_idx
  on public.payroll_member_adjustments(org_id, member_id, pay_month);

alter table public.payroll_member_adjustments enable row level security;

-- 本人 or admin が SELECT
drop policy if exists payroll_member_adjustments_select on public.payroll_member_adjustments;
create policy payroll_member_adjustments_select on public.payroll_member_adjustments
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      exists (
        select 1 from public.members m
        where m.id = payroll_member_adjustments.member_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

-- 本人 or admin が INSERT
drop policy if exists payroll_member_adjustments_insert on public.payroll_member_adjustments;
create policy payroll_member_adjustments_insert on public.payroll_member_adjustments
  for insert to authenticated
  with check (
    org_id = public.get_user_org_id()
    and (
      exists (
        select 1 from public.members m
        where m.id = payroll_member_adjustments.member_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

-- 本人 or admin が UPDATE
drop policy if exists payroll_member_adjustments_update on public.payroll_member_adjustments;
create policy payroll_member_adjustments_update on public.payroll_member_adjustments
  for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      exists (
        select 1 from public.members m
        where m.id = payroll_member_adjustments.member_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  )
  with check (
    org_id = public.get_user_org_id()
    and (
      exists (
        select 1 from public.members m
        where m.id = payroll_member_adjustments.member_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

-- 本人 or admin が DELETE
drop policy if exists payroll_member_adjustments_delete on public.payroll_member_adjustments;
create policy payroll_member_adjustments_delete on public.payroll_member_adjustments
  for delete to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      exists (
        select 1 from public.members m
        where m.id = payroll_member_adjustments.member_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

comment on table public.payroll_member_adjustments is
  'メンバー×月の任意調整項目（特別ボーナス/控除）。Payroll サマリー合計と請求書PDF明細の両方に反映。';
