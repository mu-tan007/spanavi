-- membersテーブルにDELETEポリシーを追加
-- 認証済みユーザーが組織内のメンバーを削除できるようにする

drop policy if exists "authenticated_delete_members" on public.members;

create policy "authenticated_delete_members"
  on public.members
  for delete
  to authenticated
  using (org_id = 'a0000000-0000-0000-0000-000000000001');
