-- プロフィール画像関連の修正
-- 1. profile-images バケットをパブリックに設定（getPublicUrl が機能するために必要）
-- 2. 認証済みユーザーが members.avatar_url を更新できるようにRLSを修正

-- profile-images バケットをパブリックに設定
insert into storage.buckets (id, name, public)
  values ('profile-images', 'profile-images', true)
  on conflict (id) do update set public = true;

-- membersテーブルの UPDATE ポリシーを修正
-- user_id が null のメンバーでも avatar_url を更新できるようにする
drop policy if exists "members_avatar_update" on public.members;
drop policy if exists "authenticated_update_members_avatar" on public.members;
drop policy if exists "Users can update their own member record" on public.members;
drop policy if exists "Enable update for authenticated users" on public.members;

-- 認証済みユーザーは組織内の任意メンバーの avatar_url を更新可能
create policy "authenticated_update_members_avatar"
  on public.members
  for update
  to authenticated
  using (org_id = 'a0000000-0000-0000-0000-000000000001')
  with check (org_id = 'a0000000-0000-0000-0000-000000000001');
