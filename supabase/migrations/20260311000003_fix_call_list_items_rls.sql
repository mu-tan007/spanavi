-- call_list_itemsのRLSを修正
-- 認証済みユーザーが組織内の全架電先企業を参照できるようにする
-- （現状では overly restrictive なポリシーにより検索結果が4件しか返らない問題を修正）

-- 既存の SELECT ポリシーをすべて削除して再作成
drop policy if exists "org_members_read_call_list_items" on public.call_list_items;
drop policy if exists "Users can view call list items in their org" on public.call_list_items;
drop policy if exists "authenticated can read call_list_items" on public.call_list_items;
drop policy if exists "Enable read access for authenticated users" on public.call_list_items;
drop policy if exists "Allow authenticated select" on public.call_list_items;

-- 認証済みユーザーは組織内の全架電先企業を参照可能
create policy "authenticated_read_call_list_items"
  on public.call_list_items
  for select
  to authenticated
  using (org_id = 'a0000000-0000-0000-0000-000000000001');
