-- 買収タブ：案件ページの活動履歴にメモを書けるようにする（手段に memo を足す）
set lock_timeout = '5s';
alter table public.acq_activities drop constraint if exists acq_activities_channel_check;
alter table public.acq_activities add constraint acq_activities_channel_check
  check (channel in ('email', 'line', 'phone', 'meeting', 'zoom', 'memo', 'other'));
