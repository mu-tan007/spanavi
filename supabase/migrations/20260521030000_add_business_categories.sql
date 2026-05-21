-- =====================================================================
-- 商材（business_categories）レイヤー新設
-- ---------------------------------------------------------------------
-- 経緯:
--   事業 > 商材 > 業務種別 の3階層を表現するため、products と engagements の
--   間に business_categories テーブルを新設する。
--
--   事業（products）:     営業代行 / スパキャリ / Spartia Recruitment
--   商材（categories）:    M&A（営業代行配下、現状唯一）, 将来: SaaS / 人材 / IFA
--   業務種別（engagements）: 売り手ソーシング / 買い手マッチング / クライアント開拓
--
-- 変更:
--   1) business_categories テーブル作成
--   2) M&A 商材を MASP org の営業代行 product 配下に投入
--   3) engagements.category_id を追加
--   4) seller_sourcing / matching / client_acquisition に M&A category を紐付け
-- =====================================================================

set local search_path = public, extensions;

-- 1) business_categories テーブル作成
create table if not exists public.business_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  slug text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists idx_business_categories_org_id on public.business_categories(org_id);
create index if not exists idx_business_categories_product_id on public.business_categories(product_id);

alter table public.business_categories enable row level security;

drop policy if exists business_categories_tenant_isolation on public.business_categories;
create policy business_categories_tenant_isolation on public.business_categories
  using (org_id = public.get_user_org_id());

comment on table public.business_categories is '事業 > 商材 > 業務種別 の中間レイヤー（M&A / SaaS / 人材 / IFA 等）';

-- 2) M&A 商材を投入
insert into public.business_categories (org_id, product_id, name, slug, display_order, is_active, description)
select
  p.org_id,
  p.id,
  'M&A',
  'm_and_a',
  1,
  true,
  'M&A仲介商材（売り手ソーシング・買い手マッチング・クライアント開拓）'
from public.products p
where p.slug = 'sales_agency'
on conflict (org_id, slug) do nothing;

-- 3) engagements に category_id 追加
alter table public.engagements
  add column if not exists category_id uuid references public.business_categories(id) on delete set null;

create index if not exists idx_engagements_category_id on public.engagements(category_id);

-- 4) 営業代行配下の engagements を M&A 商材に紐付け
update public.engagements e
   set category_id = bc.id,
       updated_at = now()
  from public.business_categories bc
 where bc.slug = 'm_and_a'
   and bc.org_id = e.org_id
   and e.slug in ('seller_sourcing', 'matching', 'client_acquisition')
   and e.category_id is null;
