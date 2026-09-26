-- 週次ミーティング録画の視聴権限（第34回 2026-09-26 以降）
--   見られるのは：管理者／出席者／個別に許可した人（LINEで依頼）／その回より後に入社した人
--   第33回までは全員が見られるまま（access_restricted = false）
set lock_timeout = '5s';

alter table public.weekly_meeting_videos
  add column if not exists access_restricted boolean not null default true;

update public.weekly_meeting_videos
   set access_restricted = false
 where meeting_date < date '2026-09-26' or meeting_date is null;

create table if not exists public.weekly_meeting_viewers (
  video_id   uuid not null references public.weekly_meeting_videos(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  org_id     uuid not null,
  reason     text not null check (reason in ('attended', 'granted')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (video_id, member_id)
);
create index if not exists weekly_meeting_viewers_member_idx on public.weekly_meeting_viewers(member_id);

alter table public.weekly_meeting_viewers enable row level security;

create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

-- 閲覧は同じ組織なら誰でも（誰が出席扱いかは隠さない）。書き込みは管理者だけ
drop policy if exists wmvw_select on public.weekly_meeting_viewers;
create policy wmvw_select on public.weekly_meeting_viewers
  for select using (org_id = public.get_user_org_id());
drop policy if exists wmvw_write on public.weekly_meeting_viewers;
create policy wmvw_write on public.weekly_meeting_viewers
  for all using (org_id = public.get_user_org_id() and public.is_org_admin())
  with check (org_id = public.get_user_org_id() and public.is_org_admin());

-- 呼び出した本人がこの回を見られるか
create or replace function public.can_view_weekly_meeting(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
      from public.weekly_meeting_videos v
     where v.id = p_video_id
       and v.org_id = public.get_user_org_id()
       and (
         not v.access_restricted
         or public.is_org_admin()
         or exists (
           select 1 from public.members m
            where m.user_id = auth.uid() and m.is_active
              and (
                -- 入社前の回は見られる
                (m.start_date is not null and v.meeting_date is not null and m.start_date > v.meeting_date)
                or exists (select 1 from public.weekly_meeting_viewers w
                            where w.video_id = v.id and w.member_id = m.id)
              )
         )
       )
  );
$$;

-- 一覧用：見られない回のIDを返す（画面で鍵マークを出す）
create or replace function public.my_locked_weekly_meetings()
returns setof uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select v.id from public.weekly_meeting_videos v
   where v.org_id = public.get_user_org_id()
     and v.access_restricted
     and not public.can_view_weekly_meeting(v.id);
$$;

grant execute on function public.can_view_weekly_meeting(uuid) to authenticated;
grant execute on function public.my_locked_weekly_meetings() to authenticated;
grant execute on function public.is_org_admin() to authenticated;

-- weekly_meeting_videos は組織内なら誰でも update できる（再生準備の状態更新に使う）ので、
-- 視聴制限の付け外しと動画IDの差し替えは管理者に限る
-- （公開中の回に制限付きの回の動画IDを付け替えると、再生用の鍵が取れてしまうため）
create or replace function public.guard_weekly_meeting_access_flag()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if (new.access_restricted is distinct from old.access_restricted
      or new.stream_uid is distinct from old.stream_uid)
     and auth.uid() is not null and not public.is_org_admin() then
    raise exception '視聴制限と動画を変更できるのは管理者だけです';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_weekly_meeting_access_flag on public.weekly_meeting_videos;
create trigger trg_guard_weekly_meeting_access_flag
  before update of access_restricted, stream_uid on public.weekly_meeting_videos
  for each row execute function public.guard_weekly_meeting_access_flag();

-- 回の登録は管理者だけ（画面でもアップロード欄は管理者にしか出していない）
drop policy if exists wmv_insert_own_org on public.weekly_meeting_videos;
create policy wmv_insert_own_org on public.weekly_meeting_videos
  for insert with check (org_id = public.get_user_org_id() and public.is_org_admin());
