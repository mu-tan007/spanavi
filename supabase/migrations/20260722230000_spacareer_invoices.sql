-- ============================================================
-- スパキャリ売上管理: Stripe請求書ミラー
-- ----------------------------------------------------------------
-- 目的: スパキャリ受講料は Stripe 上で「手動で請求書(Invoice)発行」している。
--       これを Supabase にミラーし、スパキャリ管理タブ「売上管理」で
--       月次売上 / 受講生別入金状況 / コース別内訳 / 消込 を表示する。
-- 連携: 専用 Edge Function stripe-spacareer-webhook / stripe-spacareer-sync が
--       service_role で upsert する。閲覧は admin のみ（売上=経営情報）。
-- 突合: Stripe customer.email = members.email → spacareer_customers。
-- 金額: JPY はゼロ小数通貨のため bigint（円）で保持。
-- ============================================================

set local search_path = public, extensions;

-- ----------------------------------------------------------------
-- 1. spacareer_invoices - Stripe Invoice ミラー
-- ----------------------------------------------------------------
create table if not exists public.spacareer_invoices (
  id text primary key,                         -- Stripe invoice id (in_...)
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Stripe 顧客
  stripe_customer_id text,
  customer_email text,
  customer_name text,

  -- 受講生突合結果（メール一致で解決。未一致なら null → 消込画面で手動割当）
  spacareer_customer_id uuid references public.spacareer_customers(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,

  -- 請求書メタ
  number text,                                 -- 請求書番号 (Stripe採番)
  status text,                                 -- draft / open / paid / uncollectible / void
  currency text default 'jpy',

  -- 金額（円）
  subtotal bigint,
  tax bigint,
  total bigint,
  amount_due bigint,
  amount_paid bigint,
  amount_remaining bigint,

  -- リンク
  hosted_invoice_url text,
  invoice_pdf text,
  description text,

  -- 日付
  period_start timestamptz,
  period_end timestamptz,
  due_date timestamptz,
  finalized_at timestamptz,
  paid_at timestamptz,
  stripe_created_at timestamptz,

  raw jsonb,                                   -- Stripe Invoice オブジェクト全体
  excluded boolean not null default false,     -- スパキャリ対象外（他事業請求書等）として消込画面で除外
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sc_invoices_org on public.spacareer_invoices(org_id);
create index if not exists idx_sc_invoices_email on public.spacareer_invoices(customer_email);
create index if not exists idx_sc_invoices_customer on public.spacareer_invoices(spacareer_customer_id);
create index if not exists idx_sc_invoices_status on public.spacareer_invoices(status);
create index if not exists idx_sc_invoices_paid_at on public.spacareer_invoices(paid_at);
create index if not exists idx_sc_invoices_created on public.spacareer_invoices(stripe_created_at);
create index if not exists idx_sc_invoices_excluded on public.spacareer_invoices(excluded);

comment on table public.spacareer_invoices is
  'スパキャリ Stripe 請求書ミラー。stripe-spacareer-webhook/sync が service_role で upsert。閲覧は admin のみ。';

-- ----------------------------------------------------------------
-- 2. spacareer_invoice_items - 請求書明細（コース別内訳用）
-- ----------------------------------------------------------------
create table if not exists public.spacareer_invoice_items (
  id text primary key,                         -- Stripe invoice line id (il_.../ii_...)
  invoice_id text not null references public.spacareer_invoices(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  description text,
  amount bigint,                               -- 円
  quantity integer,
  currency text default 'jpy',
  price_id text,
  product_id text,
  product_name text,

  created_at timestamptz not null default now()
);

create index if not exists idx_sc_invoice_items_invoice on public.spacareer_invoice_items(invoice_id);
create index if not exists idx_sc_invoice_items_org on public.spacareer_invoice_items(org_id);
create index if not exists idx_sc_invoice_items_product on public.spacareer_invoice_items(product_name);

comment on table public.spacareer_invoice_items is
  'スパキャリ請求書の明細行。コース/商材別の売上内訳集計に使用。';

-- ----------------------------------------------------------------
-- 3. RLS - 閲覧は admin のみ（service_role は RLS をバイパスして書込）
-- ----------------------------------------------------------------
alter table public.spacareer_invoices enable row level security;
alter table public.spacareer_invoice_items enable row level security;

drop policy if exists sc_invoices_admin_select on public.spacareer_invoices;
create policy sc_invoices_admin_select on public.spacareer_invoices
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

-- 消込画面での手動リンク / 対象外設定を admin が行えるようにする UPDATE ポリシー。
-- これが無いと PostgREST の UPDATE が RLS で0行更新になり無言で失敗する。
drop policy if exists sc_invoices_admin_update on public.spacareer_invoices;
create policy sc_invoices_admin_update on public.spacareer_invoices
  for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  )
  with check (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

drop policy if exists sc_invoice_items_admin_select on public.spacareer_invoice_items;
create policy sc_invoice_items_admin_select on public.spacareer_invoice_items
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

-- ----------------------------------------------------------------
-- 4. updated_at 自動更新
-- ----------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function public.set_updated_at()
    returns trigger language plpgsql as $f$
    begin new.updated_at = now(); return new; end;
    $f$;
  end if;
end $$;

drop trigger if exists trg_sc_invoices_updated_at on public.spacareer_invoices;
create trigger trg_sc_invoices_updated_at
  before update on public.spacareer_invoices
  for each row execute function public.set_updated_at();
