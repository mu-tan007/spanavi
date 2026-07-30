set local search_path = public, extensions;

-- スパキャリ トレーナー報酬の請求書。
-- 営業代行の payroll_invoices は (org_id, member_id, pay_month) 一意で
-- maybeSingle() 前提の関数が複数あるため、相乗りせず別テーブルにする。
-- （同一メンバーが営業代行とスパキャリの両方で同月に請求すると衝突するため）
-- Storage は同じ payroll-invoices バケットを使い、ファイル名を spacareer_ で分ける。
-- バケットのRLSは path の2番目=member_id で判定しているのでポリシー変更は不要。
create table if not exists public.spacareer_trainer_invoices (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  pay_month        text not null check (pay_month ~ '^[0-9]{4}-[0-9]{2}$'),
  storage_path     text not null,
  file_name        text,
  mime_type        text,
  file_size_bytes  bigint,
  -- 発行時点の内訳を控える。単価改定後に過去の請求書と画面がズレないようにする。
  session_count    integer not null default 0,
  session_amount   integer not null default 0,
  fixed_allowance  integer not null default 0,
  total_amount     integer not null default 0,
  uploaded_at      timestamptz not null default now(),
  uploaded_by      uuid,
  unique (org_id, member_id, pay_month)
);

comment on table public.spacareer_trainer_invoices is
  'スパキャリ トレーナー個人 → 当社宛の業務委託請求書。金額は税込。発行時点の内訳を控える。';

alter table public.spacareer_trainer_invoices enable row level security;

drop policy if exists spacareer_trainer_invoices_select on public.spacareer_trainer_invoices;
create policy spacareer_trainer_invoices_select
  on public.spacareer_trainer_invoices for select
  using (
    org_id = public.get_user_org_id()
    and (public.spacareer_is_admin() or member_id = public.spacareer_current_member_id())
  );

drop policy if exists spacareer_trainer_invoices_write on public.spacareer_trainer_invoices;
create policy spacareer_trainer_invoices_write
  on public.spacareer_trainer_invoices for all
  using (
    org_id = public.get_user_org_id()
    and (public.spacareer_is_admin() or member_id = public.spacareer_current_member_id())
  )
  with check (
    org_id = public.get_user_org_id()
    and (public.spacareer_is_admin() or member_id = public.spacareer_current_member_id())
  );
