-- 架電集中画面のカレンダータブに担当者のタブを出すか（例: オープングループは佐藤様だけ出す）
set lock_timeout = '5s';
alter table public.client_contacts
  add column if not exists show_in_call_calendar boolean not null default true;
