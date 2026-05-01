-- ============================================================
-- 一部の RLS ポリシーが MASP org_id (a0000000-...) をハードコード
-- しているため、公開版 (test_org 等) のユーザーが UPDATE/DELETE/ALL
-- できない問題を修正。
--
-- いずれも get_user_org_id() ベースに置換。MASP ユーザーの
-- get_user_org_id() は a0000000-... を返すので MASP 挙動は不変。
--
-- 影響テーブル:
--   - members           (UPDATE / DELETE)  ← MyPage 保存が反映されない直接原因
--   - incoming_calls    (ALL)
--   - recording_bookmarks (ALL)
-- ============================================================

drop policy if exists "authenticated_update_members_avatar" on public.members;
create policy "members_update_same_org"
  on public.members for update
  using      (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

drop policy if exists "authenticated_delete_members" on public.members;
create policy "members_delete_same_org"
  on public.members for delete
  using (org_id = public.get_user_org_id());

drop policy if exists "org_access" on public.incoming_calls;
create policy "incoming_calls_same_org"
  on public.incoming_calls for all
  using      (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

drop policy if exists "recording_bookmarks_all" on public.recording_bookmarks;
create policy "recording_bookmarks_same_org"
  on public.recording_bookmarks for all
  using      (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());
