-- スパキャリ売上: Stripe 顧客ミラー（新規顧客を顧客作成日ベースでStripeと一致させる）
set local search_path = public, extensions;

create table if not exists public.spacareer_stripe_customers (
  id text primary key,                         -- Stripe customer id (cus_...)
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text,
  name text,
  created timestamptz,                         -- 顧客作成日（新規顧客カウントの基準）
  livemode boolean,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists idx_sc_stripe_cust_org on public.spacareer_stripe_customers(org_id);
create index if not exists idx_sc_stripe_cust_created on public.spacareer_stripe_customers(created);

comment on table public.spacareer_stripe_customers is
  'スパキャリ Stripe 顧客ミラー。新規顧客指標を Stripe同様「顧客作成日」で算出。admin限定閲覧。';

alter table public.spacareer_stripe_customers enable row level security;

drop policy if exists sc_stripe_cust_admin_select on public.spacareer_stripe_customers;
create policy sc_stripe_cust_admin_select on public.spacareer_stripe_customers
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );
