-- =====================================================================
-- payroll-invoices Storage bucket 作成 + RLS
-- ---------------------------------------------------------------------
-- 経緯:
--   payroll_invoices テーブル (20260518000002) と対になるオブジェクト
--   ストレージ。本人のみ書込、本人 + admin のみ読込。
--
-- パス構造:
--   {orgId}/{memberId}/{pay_month}.{ext}
--   例: 1234.../abcd.../2026-05.pdf
-- =====================================================================

set local search_path = public, extensions;

-- バケット作成（既にあれば update）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payroll-invoices',
  'payroll-invoices',
  false,
  5242880,  -- 5MB
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ストレージ RLS
-- パスの先頭セグメントは org_id、2 番目は member_id

-- SELECT: 本人 (members.user_id = auth.uid()) または admin
drop policy if exists payroll_invoices_storage_select on storage.objects;
create policy payroll_invoices_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payroll-invoices'
    and (
      exists (
        select 1 from public.members m
        where m.id::text = (storage.foldername(name))[2]
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

-- INSERT/UPDATE/DELETE: 本人のみ（自分の member_id 配下のパスに限る）
drop policy if exists payroll_invoices_storage_insert on storage.objects;
create policy payroll_invoices_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payroll-invoices'
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(name))[2]
        and m.user_id = auth.uid()
    )
  );

drop policy if exists payroll_invoices_storage_update on storage.objects;
create policy payroll_invoices_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'payroll-invoices'
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(name))[2]
        and m.user_id = auth.uid()
    )
  );

drop policy if exists payroll_invoices_storage_delete on storage.objects;
create policy payroll_invoices_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payroll-invoices'
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(name))[2]
        and m.user_id = auth.uid()
    )
  );
