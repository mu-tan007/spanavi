-- Zoomのクラウド録画を R2 へ移した記録（2026-10-08 むー様決定）
-- ---------------------------------------------------------------------------
-- Zoomのクラウド容量はアカウント全体で40GB。2026-10-08に満杯になり、
-- 全員のクラウド録画が止まった。容量は買い足さず、録画をR2へ移して
-- スパナビの中で見られるようにする。
--
-- 1行＝Zoomの録画ファイル1本（1回の会議に動画・音声・文字起こしなど数本ある）。
-- ⚠️ Zoomから外すのは、その会議の全ファイルが R2 に入り、大きさが一致したあとだけ。

create table if not exists public.zoom_cloud_recordings (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  zoom_file_id       text not null unique,
  zoom_meeting_uuid  text not null,
  zoom_meeting_id    text,
  host_email         text,
  topic              text,
  start_time         timestamptz,
  duration_min       integer,
  file_type          text,           -- MP4 / M4A / TRANSCRIPT / CHAT など
  recording_type     text,           -- shared_screen_with_speaker_view など
  file_size          bigint,
  r2_key             text not null unique,
  copied_at          timestamptz,    -- R2に入り、大きさが一致した時刻
  zoom_trashed_at    timestamptz,    -- Zoomのゴミ箱へ送った時刻
  created_at         timestamptz not null default now()
);

create index if not exists zoom_cloud_recordings_meeting_idx on public.zoom_cloud_recordings (zoom_meeting_uuid);
create index if not exists zoom_cloud_recordings_host_start_idx on public.zoom_cloud_recordings (host_email, start_time);

alter table public.zoom_cloud_recordings enable row level security;

-- 営業面談の録画を含むので、営業ファネルと同じく管理者だけ。
drop policy if exists zoom_cloud_recordings_admin_read on public.zoom_cloud_recordings;
create policy zoom_cloud_recordings_admin_read on public.zoom_cloud_recordings
  for select using (
    org_id = get_user_org_id()
    and exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );

-- r2 の sign-get が使う「見てよいか」に zoomcloud を足す。
create or replace function public.may_read_r2_key(p_uid uuid, p_kind text, p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (   -- 社内の人。所属は users と members の両方から集める
    select org_id from users   where id = p_uid      and org_id is not null
    union
    select org_id from members where user_id = p_uid and org_id is not null
  ),
  cl as (        -- クライアントポータルの人
    select id, org_id from clients where auth_user_id = p_uid
  )
  select case p_kind
    when 'recordings' then
      -- 社内：自分の組織の録音なら、架電のものでもアポのものでも聞ける
      exists (select 1 from call_records r
               where r.org_id in (select org_id from me)
                 and r.recording_url like '%' || p_key || '%'
                 and r2_recording_key(r.recording_url) = p_key)
      or exists (select 1 from appointments a
                  where a.org_id in (select org_id from me)
                    and a.recording_url like '%' || p_key || '%'
                    and r2_recording_key(a.recording_url) = p_key)
      -- クライアント：自分の架電リストのぶんだけ
      or exists (select 1 from call_records r
                   join call_lists l on l.id = r.list_id
                   join cl on cl.id = l.client_id and cl.org_id = r.org_id
                  where r.recording_url like '%' || p_key || '%'
                    and r2_recording_key(r.recording_url) = p_key)
      -- クライアント：自分のアポのぶんだけ
      or exists (select 1 from appointments a
                   join cl on cl.id = a.client_id and cl.org_id = a.org_id
                  where a.recording_url like '%' || p_key || '%'
                    and r2_recording_key(a.recording_url) = p_key)
    when 'spacareer' then exists (
      select 1 from spacareer_session_videos v
       where v.org_id in (select org_id from me)
         and (v.storage_path = p_key or v.audio_storage_path = p_key))
    -- Zoomから移した録画：自分の組織の管理者だけ
    when 'zoomcloud' then exists (
      select 1 from zoom_cloud_recordings z
        join users u on u.id = p_uid and u.role = 'admin' and u.org_id = z.org_id
       where z.r2_key = p_key and z.copied_at is not null)
    else false
  end;
$function$;
