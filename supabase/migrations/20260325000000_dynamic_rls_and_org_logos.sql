-- ============================================================
-- RLSポリシーを動的org_idに移行 + org-logosバケット作成
-- 既存ユーザーは全員同一org_idなので動作への影響なし
-- ============================================================

-- ── ヘルパー関数: 認証ユーザーのorg_idを取得 ──────────────────
create or replace function public.get_user_org_id()
returns uuid
language sql
stable
security definer
as $$
  select org_id from public.members
  where id = (
    -- メールからmember_idを抽出: user_{memberId}@masp-internal.com
    select substring(email from 'user_(.+)@masp-internal\.com')
    from auth.users where id = auth.uid()
  )
  limit 1;
$$;

-- ── call_list_items: SELECT ポリシー再作成 ─────────────────────
drop policy if exists "authenticated_read_call_list_items" on public.call_list_items;
create policy "authenticated_read_call_list_items"
  on public.call_list_items
  for select
  to authenticated
  using (org_id = public.get_user_org_id());

-- ── incoming_calls: ALL ポリシー再作成 ─────────────────────────
drop policy if exists "authenticated_all_incoming_calls" on public.incoming_calls;
create policy "authenticated_all_incoming_calls"
  on public.incoming_calls
  for all
  to authenticated
  using (org_id = public.get_user_org_id());

-- ── org_settings: SELECT + ALL ポリシー再作成 ─────────────────
drop policy if exists "org_settings_select" on public.org_settings;
drop policy if exists "org_settings_all" on public.org_settings;
create policy "org_settings_select"
  on public.org_settings
  for select
  to authenticated
  using (org_id = public.get_user_org_id());
create policy "org_settings_all"
  on public.org_settings
  for all
  to authenticated
  using (org_id = public.get_user_org_id());

-- ── members: DELETE ポリシー再作成 ────────────────────────────
drop policy if exists "authenticated_delete_members" on public.members;
create policy "authenticated_delete_members"
  on public.members
  for delete
  to authenticated
  using (org_id = public.get_user_org_id());

-- ── org-logos ストレージバケット作成 ──────────────────────────
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

-- org-logos: 認証ユーザーはアップロード/上書き可能
create policy "org_logos_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'org-logos');

create policy "org_logos_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'org-logos');

-- org-logos: 公開読み取り（ロゴ表示用）
create policy "org_logos_select"
  on storage.objects
  for select
  to public
  using (bucket_id = 'org-logos');
