-- スパキャリ売上: Stripe 返金ミラー（純売上高をStripeと完全一致させる）
set local search_path = public, extensions;

create table if not exists public.spacareer_refunds (
  id text primary key,                         -- Stripe refund id (re_...)
  org_id uuid not null references public.organizations(id) on delete cascade,
  charge_id text,
  amount bigint,                               -- 返金額（円）
  currency text default 'jpy',
  reason text,
  status text,
  created timestamptz,                         -- 返金日（純売上高の期間帰属に使用）
  raw jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists idx_sc_refunds_org on public.spacareer_refunds(org_id);
create index if not exists idx_sc_refunds_created on public.spacareer_refunds(created);

comment on table public.spacareer_refunds is
  'スパキャリ Stripe 返金ミラー。純売上高（総売上高−手数料−返金）の算出に使用。admin限定閲覧。';

alter table public.spacareer_refunds enable row level security;

drop policy if exists sc_refunds_admin_select on public.spacareer_refunds;
create policy sc_refunds_admin_select on public.spacareer_refunds
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );
