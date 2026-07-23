-- ============================================================
-- スパキャリ売上管理: Stripe サブスクリプション ミラー
-- ----------------------------------------------------------------
-- 目的: 売上管理ダッシュボードの MRR / 有効なサブスクリプション登録者 を出すため、
--       Stripe のサブスクリプションを Supabase にミラーする。
--       stripe-spacareer-webhook / sync が service_role で upsert。閲覧は admin のみ。
-- ============================================================

set local search_path = public, extensions;

create table if not exists public.spacareer_subscriptions (
  id text primary key,                         -- Stripe subscription id (sub_...)
  org_id uuid not null references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  customer_email text,
  customer_name text,
  spacareer_customer_id uuid references public.spacareer_customers(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  status text,                                 -- active/trialing/past_due/canceled/unpaid/incomplete...
  currency text default 'jpy',
  mrr bigint,                                  -- 月次正規化した金額（円）
  quantity integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  start_date timestamptz,
  canceled_at timestamptz,
  items jsonb,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sc_subs_org on public.spacareer_subscriptions(org_id);
create index if not exists idx_sc_subs_status on public.spacareer_subscriptions(status);
create index if not exists idx_sc_subs_customer on public.spacareer_subscriptions(spacareer_customer_id);

comment on table public.spacareer_subscriptions is
  'スパキャリ Stripe サブスクリプション ミラー。MRR / 有効サブスク登録者の集計に使用。admin限定閲覧。';

alter table public.spacareer_subscriptions enable row level security;

drop policy if exists sc_subs_admin_select on public.spacareer_subscriptions;
create policy sc_subs_admin_select on public.spacareer_subscriptions
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

drop trigger if exists trg_sc_subs_updated_at on public.spacareer_subscriptions;
create trigger trg_sc_subs_updated_at
  before update on public.spacareer_subscriptions
  for each row execute function public.set_updated_at();
