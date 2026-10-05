-- 周回報告：送り方ごとに文面を分け、メールのクライアント様は Gmail に下書きを作る（2026-10-05 篠宮）
-- delivery：slack（共有チャンネル）／chatwork／email。決め方は事前確認と同じ
-- status 'gmail_draft'：Gmail に下書きを作った（送信はむー様が Gmail で）
set lock_timeout = '5s';

alter table public.round_reports add column if not exists delivery text not null default 'slack'
  check (delivery in ('slack', 'chatwork', 'email'));
alter table public.round_reports add column if not exists mail_to text;
alter table public.round_reports add column if not exists mail_cc text;
alter table public.round_reports add column if not exists mail_subject text;
alter table public.round_reports add column if not exists gmail_draft_id text;
alter table public.round_reports add column if not exists draft_error text;

alter table public.round_reports drop constraint if exists round_reports_status_check;
alter table public.round_reports add constraint round_reports_status_check
  check (status in ('draft', 'gmail_draft', 'sent', 'dismissed'));
