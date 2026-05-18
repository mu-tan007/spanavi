-- =====================================================================
-- 業務委託契約書テンプレ機能 (MASP メンバー画面)
-- ---------------------------------------------------------------------
-- 新入社員が決まったら、テンプレに ①氏名 ②住所 ③契約開始日/終了日(1年自動更新)
-- ④口座情報 を差し込んで .docx を生成し、GMOサインへアップロードする運用。
--
-- 追加内容:
--   1. members に address (text), bank_info (jsonb) を追加
--   2. contract_templates テーブル (テンプレ管理、複数登録可)
--   3. contracts テーブル (生成ログ)
--   4. Storage bucket "contract-templates" + RLS
-- =====================================================================

set local search_path = public, extensions;

-- 1. members に個人情報カラム追加
alter table public.members
  add column if not exists address text,
  add column if not exists bank_info jsonb;

comment on column public.members.address is '業務委託契約書差し込み用の住所';
comment on column public.members.bank_info is
  '口座情報 JSON: {bank_name, branch_name, account_type, account_number, account_holder}';

-- 2. contract_templates: org ごとの契約書テンプレ管理
create table if not exists public.contract_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  name        text not null,
  file_path   text not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  is_active   boolean not null default true
);
create index if not exists contract_templates_org_active_idx
  on public.contract_templates (org_id) where is_active;

alter table public.contract_templates enable row level security;

drop policy if exists contract_templates_select on public.contract_templates;
create policy contract_templates_select on public.contract_templates
  for select to authenticated
  using (org_id = public.get_user_org_id());

drop policy if exists contract_templates_admin_write on public.contract_templates;
create policy contract_templates_admin_write on public.contract_templates
  for all to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- 3. contracts: 生成済み契約書ログ
create table if not exists public.contracts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  member_id    uuid not null references public.members(id) on delete cascade,
  template_id  uuid references public.contract_templates(id) on delete set null,
  start_date   date not null,
  end_date     date not null,
  payload      jsonb not null,
  generated_by uuid,
  generated_at timestamptz not null default now()
);
create index if not exists contracts_org_member_idx on public.contracts (org_id, member_id);

alter table public.contracts enable row level security;

drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts
  for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      or exists (select 1 from public.members m where m.id = contracts.member_id and m.user_id = auth.uid())
    )
  );

drop policy if exists contracts_admin_write on public.contracts;
create policy contracts_admin_write on public.contracts
  for all to authenticated
  using (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
  with check (
    org_id = public.get_user_org_id()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- 4. Storage bucket "contract-templates"
-- パス構造: {orgId}/{templateId}.docx
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-templates',
  'contract-templates',
  false,
  10485760,  -- 10MB
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- SELECT: 同 org の認証ユーザー全員（テンプレは社内共有）
drop policy if exists contract_templates_storage_select on storage.objects;
create policy contract_templates_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contract-templates'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

-- INSERT/UPDATE/DELETE: admin のみ
drop policy if exists contract_templates_storage_insert on storage.objects;
create policy contract_templates_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contract-templates'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

drop policy if exists contract_templates_storage_update on storage.objects;
create policy contract_templates_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'contract-templates'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

drop policy if exists contract_templates_storage_delete on storage.objects;
create policy contract_templates_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'contract-templates'
    and (storage.foldername(name))[1] = public.get_user_org_id()::text
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );
