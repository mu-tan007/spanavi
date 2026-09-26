-- 週次ミーティング録画の視聴記録
--   source = 'player'    : プレーヤーが送る「何秒から何秒まで見たか」の区間（1区間1行・見ている間は end_sec を伸ばす）
--   source = 'estimated' : 記録を始める前の分。Cloudflare の再生記録と Spanavi のアクセス記録を突き合わせて推定した
--                          視聴分数（区間は分からないので start_sec / end_sec は空）
-- 閲覧は同じ組織なら誰でも（視聴状況は全員に見せる）。書き込みは本人の 'player' 行だけ
set lock_timeout = '5s';

create table if not exists public.weekly_meeting_watch_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.get_user_org_id(),
  video_id    uuid not null references public.weekly_meeting_videos(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  source      text not null default 'player' check (source in ('player', 'estimated')),
  start_sec   integer check (start_sec >= 0),
  end_sec     integer check (end_sec >= start_sec),
  watched_sec integer not null default 0 check (watched_sec >= 0),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz not null default now(),
  device      text,
  created_at  timestamptz not null default now(),
  check (source <> 'player' or (start_sec is not null and end_sec is not null))
);
create index if not exists wmwl_video_idx on public.weekly_meeting_watch_logs(video_id);
create index if not exists wmwl_user_idx on public.weekly_meeting_watch_logs(user_id);

alter table public.weekly_meeting_watch_logs enable row level security;

drop policy if exists wmwl_select on public.weekly_meeting_watch_logs;
create policy wmwl_select on public.weekly_meeting_watch_logs
  for select using (org_id = public.get_user_org_id());

drop policy if exists wmwl_insert on public.weekly_meeting_watch_logs;
create policy wmwl_insert on public.weekly_meeting_watch_logs
  for insert with check (
    user_id = auth.uid() and org_id = public.get_user_org_id() and source = 'player'
  );

drop policy if exists wmwl_update on public.weekly_meeting_watch_logs;
create policy wmwl_update on public.weekly_meeting_watch_logs
  for update using (user_id = auth.uid() and source = 'player')
  with check (user_id = auth.uid() and org_id = public.get_user_org_id() and source = 'player');
