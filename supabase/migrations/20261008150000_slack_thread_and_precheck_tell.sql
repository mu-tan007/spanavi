-- ② Slackのアポ取得報告をスレッドの形で送る：送った先（親投稿）を控え、リストごとに送り先とメンションを覚える
alter table public.appointments
  add column if not exists report_slack_channel text,
  add column if not exists report_slack_ts text,
  add column if not exists report_slack_mentions text;
alter table public.call_lists
  add column if not exists report_slack_channel text,
  add column if not exists report_slack_mentions text;

-- ③ 事前確認で先方に伝えること（クライアント様からの依頼）。伝えたら日時が入る
alter table public.appointments
  add column if not exists precheck_tell text,
  add column if not exists precheck_tell_done_at timestamptz;
