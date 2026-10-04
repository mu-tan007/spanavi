-- #事前確認 の毎朝の通知で、アポ取得者にメンションを付けるための Slack ユーザーID（2026-10-04）
-- 値はメールアドレスで Spartia の Slack と突き合わせて本番に直接入れた（17名）。新しいメンバーは同じ方法で足す
set lock_timeout = '5s';
alter table public.members add column if not exists slack_user_id text;
comment on column public.members.slack_user_id is 'Spartia の Slack のユーザーID（#事前確認 の通知でメンションに使う）。メールアドレスで Slack と突き合わせて入れる';
