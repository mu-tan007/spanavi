-- =====================================================================
-- 事業（products）レイヤー新設＋engagement名称整理
-- ---------------------------------------------------------------------
-- 経緯:
--   従来 engagements テーブルが「事業」と「業務種別」の2役を兼ねていた:
--     - 事業: Sourcing / スパキャリ / Spartia Recruitment / Spanavi / Spartia Capital
--     - 業務種別: seller_sourcing / matching / client_acquisition
--   このため UI の「対象事業」セレクタに「Sourcing」と出ていたが、これは実態
--   としては営業代行事業の中の1業務種別「売り手ソーシング」を指す名前で
--   不適切だった。
--
-- 変更:
--   1) products テーブル新規作成（営業代行、スパキャリ等の事業マスタ）
--   2) engagements.product_id (nullable) 追加
--   3) products の初期データ投入（5商材）
--   4) 既存 engagements を product に紐付け
--   5) engagement.name のリネーム（業務種別名に変更）:
--      - "Sourcing" → "売り手ソーシング"
--      - "Matching" → "買い手マッチング"
-- =====================================================================

set local search_path = public, extensions;

-- 1) products テーブル作成
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists idx_products_org_id on public.products(org_id);
create index if not exists idx_products_is_active on public.products(is_active);

alter table public.products enable row level security;

drop policy if exists products_tenant_isolation on public.products;
create policy products_tenant_isolation on public.products
  using (org_id = public.get_user_org_id());

comment on table public.products is '営業代行/スパキャリ等の事業マスタ。engagements の親レイヤー';

-- 2) engagements に product_id 追加
alter table public.engagements
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists idx_engagements_product_id on public.engagements(product_id);

-- 3) products 初期データ投入（MASP org のみ）
-- MASP org_id = 'a0000000-0000-0000-0000-000000000001'
insert into public.products (org_id, name, slug, display_order, is_active, description)
values
  ('a0000000-0000-0000-0000-000000000001'::uuid, '営業代行',           'sales_agency',          1, true,  'テレアポ営業代行事業（M&A／SaaS／人材／IFA等）'),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'スパキャリ',         'spartia_career_biz',     2, true,  'キャリアコーチング事業'),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'Spartia Recruitment','spartia_recruitment_biz',3, true,  '人材紹介事業'),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'Spanavi',            'spanavi_biz',           4, false, 'SaaS事業（休止中）'),
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'Spartia Capital',    'spartia_capital_biz',   5, false, '自社買収ソーシング事業（休止中）')
on conflict (org_id, slug) do nothing;

-- 4) 既存 engagements を product に紐付け
update public.engagements e
   set product_id = p.id,
       updated_at = now()
  from public.products p
 where p.org_id = e.org_id
   and (
        (e.slug in ('seller_sourcing','matching','client_acquisition') and p.slug = 'sales_agency')
     or (e.slug = 'spartia_career'      and p.slug = 'spartia_career_biz')
     or (e.slug = 'spartia_recruitment' and p.slug = 'spartia_recruitment_biz')
     or (e.slug = 'spanavi'             and p.slug = 'spanavi_biz')
     or (e.slug = 'spartia_capital'     and p.slug = 'spartia_capital_biz')
   )
   and e.product_id is null;

-- 5) engagement.name を業務種別名にリネーム
update public.engagements
   set name = '売り手ソーシング',
       updated_at = now()
 where slug = 'seller_sourcing'
   and name = 'Sourcing';

update public.engagements
   set name = '買い手マッチング',
       updated_at = now()
 where slug = 'matching'
   and name = 'Matching';
