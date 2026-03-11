-- usersテーブルにanonymous/authenticatedユーザーがname・email・roleを読めるポリシーを追加
-- ログイン画面での名前選択・管理者判定に使用

-- 既存のSELECTポリシーがあれば削除（再作成のため）
drop policy if exists "Public read name email role" on public.users;

-- anonymousおよびauthenticatedユーザーがname, email, roleを参照可能にする
create policy "Public read name email role"
  on public.users
  for select
  to anon, authenticated
  using (true);
