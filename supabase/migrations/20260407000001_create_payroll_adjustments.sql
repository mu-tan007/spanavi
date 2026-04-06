-- 月次Payroll調整（ディスカウント等）
create table if not exists payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  pay_month text not null,
  sales_discount integer not null default 0,
  incentive_discount integer not null default 0,
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, pay_month)
);

alter table payroll_adjustments enable row level security;

create policy "payroll_adjustments_select" on payroll_adjustments
  for select using (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);
create policy "payroll_adjustments_insert" on payroll_adjustments
  for insert with check (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);
create policy "payroll_adjustments_update" on payroll_adjustments
  for update using (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);
create policy "payroll_adjustments_delete" on payroll_adjustments
  for delete using (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);
