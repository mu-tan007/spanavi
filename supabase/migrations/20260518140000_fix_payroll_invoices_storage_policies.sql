-- =====================================================================
-- payroll-invoices storage RLS の修正
-- ---------------------------------------------------------------------
-- 経緯:
--   20260518000003 で作った storage policies の where 句:
--     EXISTS (SELECT 1 FROM members m
--             WHERE m.id::text = (storage.foldername(name))[2]
--               AND m.user_id = auth.uid())
--   は、サブクエリ内で `name` が members.name に解決されてしまい
--   （members.name は外側のスコープではなく内側で優先解決される）、
--   実際の storage.objects.name が参照できず常に false で
--   "new row violates row-level security policy" となっていた。
--
-- 修正:
--   IN 形式に変換し、`(storage.foldername(name))[2]` の name が
--   storage.objects.name に確実に解決されるようにする。
-- =====================================================================

set local search_path = public, extensions;

drop policy if exists payroll_invoices_storage_select on storage.objects;
create policy payroll_invoices_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payroll-invoices'
    and (
      (storage.foldername(name))[2] in (
        select m.id::text from public.members m where m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

drop policy if exists payroll_invoices_storage_insert on storage.objects;
create policy payroll_invoices_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payroll-invoices'
    and (storage.foldername(name))[2] in (
      select m.id::text from public.members m where m.user_id = auth.uid()
    )
  );

drop policy if exists payroll_invoices_storage_update on storage.objects;
create policy payroll_invoices_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'payroll-invoices'
    and (storage.foldername(name))[2] in (
      select m.id::text from public.members m where m.user_id = auth.uid()
    )
  );

drop policy if exists payroll_invoices_storage_delete on storage.objects;
create policy payroll_invoices_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payroll-invoices'
    and (storage.foldername(name))[2] in (
      select m.id::text from public.members m where m.user_id = auth.uid()
    )
  );
