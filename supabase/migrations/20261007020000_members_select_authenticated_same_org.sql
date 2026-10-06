-- メンバー表をログインしていない人から読めないようにする。
-- これまで members_public_select（public・using true）で、未ログインでも氏名・メール・報酬率・累計売上が読めた。
-- 未ログインで読んでいたのは旧ログイン画面の「氏名から選ぶ」だけで、2026-10-07 に廃止した。
-- ログイン後の読み取りは、同じ会社の人だけにする（get_user_org_id は user_id／旧内部アドレス／実メールの3通りで所属を引く）。
drop policy if exists members_public_select on public.members;

create policy members_select_same_org on public.members
  for select
  to authenticated
  using (org_id = (select public.get_user_org_id()));
