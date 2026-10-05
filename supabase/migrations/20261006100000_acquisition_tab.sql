-- 買収タブ（管理者のみ）：弊社が買い手として受けた売却案件の管理
--   設計は tasks/sekkei_baishu_tab.md
--   acq_firms          … 紹介元・売り手側FAなどの会社（仲介／FA／マッチングサイト／公的機関）
--   acq_contacts       … その会社の担当者
--   acq_deals          … 案件（実名とPJ名・希望価格・紹介元）。配信からの候補も stage 'candidate' で同居
--   acq_deal_stage_events … 段階の履歴。現在の段階は最新行から導く（acq_deal_list）
--   acq_deal_financials … 期ごとの財務。source='im'（IMの値）／'ours'（弊社の修正値）
--   acq_documents      … ノンネーム・IM・QA などの書類（非公開バケット acq-docs）
--   acq_activities     … 担当者とのやり取り。acq_activity_deals で複数案件にひも付く

set lock_timeout = '5s';

create table if not exists public.acq_firms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_user_org_id(),
  name text not null,
  kind text not null default 'intermediary'
    check (kind in ('intermediary', 'buy_side_fa', 'sell_side_fa', 'platform', 'public', 'other')),
  website text,
  client_id uuid references public.clients(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
comment on table public.acq_firms is '買収タブ：紹介元・FAなどの会社。client_id は営業代行の顧客と同じ会社のときだけ入れる';

create table if not exists public.acq_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_user_org_id(),
  firm_id uuid references public.acq_firms(id) on delete set null,
  name text not null,
  title text,
  email text,
  phone text,
  preferred_channel text check (preferred_channel in ('email', 'line', 'phone', 'slack', 'other')),
  line_name text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists acq_contacts_email_uq on public.acq_contacts (org_id, lower(email)) where email is not null;
create index if not exists acq_contacts_firm_idx on public.acq_contacts (firm_id);
comment on table public.acq_contacts is '買収タブ：紹介元の担当者';

create table if not exists public.acq_deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_user_org_id(),
  name text,                       -- 実名（ネームクリア前は空）
  project_name text,               -- PJ名・匿名の見出し
  industry text,
  region text,
  summary text,
  channel text not null default 'intro'
    check (channel in ('intro', 'broadcast', 'self', 'platform', 'public')),
  source_firm_id uuid references public.acq_firms(id) on delete set null,
  source_contact_id uuid references public.acq_contacts(id) on delete set null,
  sell_side_firm_id uuid references public.acq_firms(id) on delete set null,
  received_on date,
  asking_price_min bigint,         -- 円
  asking_price_max bigint,         -- 円（点なら min と同じ）
  asking_price_basis text not null default 'unknown'
    check (asking_price_basis in ('equity', 'enterprise', 'unknown')),
  asking_price_text text,          -- 原文（例「4億前半」「純資産＋営業権5年」）
  scheme text not null default 'unknown' check (scheme in ('share', 'business', 'unknown')),
  next_deadline_on date,
  next_deadline_label text,
  closed_reason text,              -- 見送り・不成約の理由
  scope_domain text,               -- 防衛関連14領域のどれか
  defense_relation text check (defense_relation in ('direct', 'industry_only', 'none')),
  corporate_number text check (corporate_number ~ '^[0-9]{13}$'),
  company_profile_id uuid references public.company_profiles(id) on delete set null,
  folder_path text,                -- OneDriveの案件フォルダ（相対）
  source_ref text,                 -- 配信メールの message id など（重複取込を防ぐ）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (name is not null or project_name is not null)
);
create index if not exists acq_deals_org_idx on public.acq_deals (org_id, received_on desc);
create unique index if not exists acq_deals_source_ref_uq on public.acq_deals (org_id, source_ref) where source_ref is not null;
comment on table public.acq_deals is '買収タブ：案件。表示名は実名優先（name）、無ければ project_name';

create table if not exists public.acq_deal_stage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_user_org_id(),
  deal_id uuid not null references public.acq_deals(id) on delete cascade,
  stage text not null check (stage in (
    'candidate', 'received', 'nda', 'im_received', 'qa', 'top_meeting', 'loi_submitted',
    'basic_agreement', 'dd', 'definitive_agreement', 'closed_won',
    'declined_by_us', 'lost', 'name_clear_denied')),
  occurred_on date not null default (now() at time zone 'Asia/Tokyo')::date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists acq_stage_events_deal_idx on public.acq_deal_stage_events (deal_id, occurred_on desc, created_at desc);

create table if not exists public.acq_deal_financials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_user_org_id(),
  deal_id uuid not null references public.acq_deals(id) on delete cascade,
  period_label text not null,      -- 例「2026/1期」「進行期」
  period_end date,
  source text not null check (source in ('im', 'ours')),
  revenue bigint,
  operating_income bigint,
  ebitda bigint,                   -- 修正EBITDA
  net_cash bigint,
  net_assets bigint,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, period_label, source)
);

create table if not exists public.acq_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_user_org_id(),
  deal_id uuid not null references public.acq_deals(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'nonname', 'im', 'qa', 'financials', 'loi', 'top_meeting', 'contract', 'valuation', 'other')),
  series text not null default 'main', -- 同じ書類の版をまとめる名前
  version_no int not null default 1,
  direction text not null default 'received' check (direction in ('received', 'sent', 'internal')),
  received_on date,
  original_name text not null,
  storage_path text not null unique,   -- {org_id}/{deal_id}/{uuid}.{ext}（ASCIIのみ）
  mime_type text,
  size_bytes bigint,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists acq_documents_deal_idx on public.acq_documents (deal_id, doc_type, series, version_no);

create table if not exists public.acq_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_user_org_id(),
  occurred_at timestamptz not null,
  channel text not null check (channel in ('email', 'line', 'phone', 'meeting', 'zoom', 'other')),
  direction text check (direction in ('in', 'out')),
  contact_id uuid references public.acq_contacts(id) on delete set null,
  firm_id uuid references public.acq_firms(id) on delete set null,
  subject text,
  summary text,
  source_url text,
  source_kind text,                -- gmail / line / manual
  source_ref text,                 -- gmail の message id など
  created_at timestamptz not null default now()
);
create unique index if not exists acq_activities_source_uq on public.acq_activities (org_id, source_kind, source_ref) where source_ref is not null;
create index if not exists acq_activities_contact_idx on public.acq_activities (contact_id, occurred_at desc);
create index if not exists acq_activities_firm_idx on public.acq_activities (firm_id, occurred_at desc);

create table if not exists public.acq_activity_deals (
  activity_id uuid not null references public.acq_activities(id) on delete cascade,
  deal_id uuid not null references public.acq_deals(id) on delete cascade,
  org_id uuid not null default public.get_user_org_id(),
  primary key (activity_id, deal_id)
);
create index if not exists acq_activity_deals_deal_idx on public.acq_activity_deals (deal_id);

-- 権限の壁：全表・全操作とも管理者だけ（全社タブと同じ）
do $$
declare t text;
begin
  foreach t in array array['acq_firms','acq_contacts','acq_deals','acq_deal_stage_events',
                           'acq_deal_financials','acq_documents','acq_activities','acq_activity_deals']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated
                      using (public.is_org_admin() and org_id = public.get_user_org_id())
                      with check (public.is_org_admin() and org_id = public.get_user_org_id())',
                   t || '_admin', t);
  end loop;
end $$;

-- 一覧用：現在の段階（最新の段階行）と、最新期の財務（弊社修正があればそれ、無ければIM）
create or replace view public.acq_deal_list
with (security_invoker = true) as
select
  d.*,
  coalesce(d.name, d.project_name) as display_name,
  st.stage as current_stage,
  st.occurred_on as stage_on,
  sf.name as source_firm_name,
  sc.name as source_contact_name,
  ss.name as sell_side_firm_name,
  fin_ours.ebitda as ebitda_ours,
  fin_im.ebitda as ebitda_im,
  coalesce(fin_ours.revenue, fin_im.revenue) as revenue,
  coalesce(fin_ours.net_cash, fin_im.net_cash) as net_cash,
  case
    when coalesce(fin_ours.ebitda, fin_im.ebitda) > 0 and coalesce(d.asking_price_min, d.asking_price_max) is not null
    then round(((coalesce(d.asking_price_min, d.asking_price_max) + coalesce(d.asking_price_max, d.asking_price_min)) / 2.0)
               / coalesce(fin_ours.ebitda, fin_im.ebitda), 1)
  end as multiple,
  docs.has_nonname, docs.has_im, docs.has_qa, docs.doc_count,
  act.last_activity_at
from public.acq_deals d
left join lateral (
  select e.stage, e.occurred_on from public.acq_deal_stage_events e
   where e.deal_id = d.id order by e.occurred_on desc, e.created_at desc limit 1
) st on true
left join public.acq_firms sf on sf.id = d.source_firm_id
left join public.acq_contacts sc on sc.id = d.source_contact_id
left join public.acq_firms ss on ss.id = d.sell_side_firm_id
left join lateral (
  select f.* from public.acq_deal_financials f where f.deal_id = d.id and f.source = 'ours'
   order by f.period_end desc nulls last, f.created_at desc limit 1
) fin_ours on true
left join lateral (
  select f.* from public.acq_deal_financials f where f.deal_id = d.id and f.source = 'im'
   order by f.period_end desc nulls last, f.created_at desc limit 1
) fin_im on true
left join lateral (
  select bool_or(x.doc_type = 'nonname') as has_nonname,
         bool_or(x.doc_type = 'im') as has_im,
         bool_or(x.doc_type = 'qa') as has_qa,
         count(*) as doc_count
    from public.acq_documents x where x.deal_id = d.id
) docs on true
left join lateral (
  select max(a.occurred_at) as last_activity_at
    from public.acq_activity_deals ad join public.acq_activities a on a.id = ad.activity_id
   where ad.deal_id = d.id
) act on true;

-- 仲介会社の集計（候補は数えない）
create or replace view public.acq_firm_stats
with (security_invoker = true) as
select
  f.*,
  (select count(*) from public.acq_contacts c where c.firm_id = f.id) as contact_count,
  count(l.id) filter (where l.current_stage is distinct from 'candidate') as deal_count,
  count(l.id) filter (where exists (
     select 1 from public.acq_deal_stage_events e where e.deal_id = l.id
        and e.stage in ('top_meeting','loi_submitted','basic_agreement','dd','definitive_agreement','closed_won'))) as top_meeting_count,
  max(l.received_on) filter (where l.current_stage is distinct from 'candidate') as last_received_on
from public.acq_firms f
left join public.acq_deal_list l on l.source_firm_id = f.id
group by f.id;

-- 書類の置き場：非公開・管理者だけ
insert into storage.buckets (id, name, public, file_size_limit)
values ('acq-docs', 'acq-docs', false, 104857600)
on conflict (id) do nothing;

drop policy if exists acq_docs_admin_all on storage.objects;
create policy acq_docs_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'acq-docs' and public.is_org_admin()
         and (storage.foldername(name))[1] = public.get_user_org_id()::text)
  with check (bucket_id = 'acq-docs' and public.is_org_admin()
         and (storage.foldername(name))[1] = public.get_user_org_id()::text);
