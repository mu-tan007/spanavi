-- Zoom録画のページを管理者以外にも開く（2026-10-09 むー様「カジにもそのページ見れるようにしてあげて」）
--   管理者                       … 全員分
--   ページ権限 zoom_recordings の人 … 自分がホストの録画だけ（members.email ＝ Zoomのホストのメール）
-- ⚠️ むー様の会議などの録画が他の人に見えないよう、ホストで絞る。

create or replace function public.zoom_cloud_can_read(p_uid uuid, p_org uuid, p_host text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from users u where u.id = p_uid and u.role = 'admin' and u.org_id = p_org)
      or exists (select 1 from members m
                   join member_page_permissions pp on pp.member_id = m.id
                  where m.user_id = p_uid and m.org_id = p_org and m.is_active
                    and pp.engagement_slug = 'spartia_career' and pp.page_key = 'zoom_recordings'
                    and lower(m.email) = lower(p_host));
$function$;

drop policy if exists zoom_cloud_recordings_admin_read on public.zoom_cloud_recordings;
drop policy if exists zoom_cloud_recordings_read on public.zoom_cloud_recordings;
create policy zoom_cloud_recordings_read on public.zoom_cloud_recordings
  for select using (zoom_cloud_can_read(auth.uid(), org_id, host_email));

-- 共有リンクの対応表は、読める会議のものだけ。
drop policy if exists zoom_cloud_share_links_admin_read on public.zoom_cloud_share_links;
drop policy if exists zoom_cloud_share_links_read on public.zoom_cloud_share_links;
create policy zoom_cloud_share_links_read on public.zoom_cloud_share_links
  for select using (exists (select 1 from zoom_cloud_recordings z
                             where z.zoom_meeting_uuid = zoom_cloud_share_links.zoom_meeting_uuid
                               and zoom_cloud_can_read(auth.uid(), z.org_id, z.host_email)));

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
      exists (select 1 from call_records r
               where r.org_id in (select org_id from me)
                 and r.recording_url like '%' || p_key || '%'
                 and r2_recording_key(r.recording_url) = p_key)
      or exists (select 1 from appointments a
                  where a.org_id in (select org_id from me)
                    and a.recording_url like '%' || p_key || '%'
                    and r2_recording_key(a.recording_url) = p_key)
      or exists (select 1 from call_records r
                   join call_lists l on l.id = r.list_id
                   join cl on cl.id = l.client_id and cl.org_id = r.org_id
                  where r.recording_url like '%' || p_key || '%'
                    and r2_recording_key(r.recording_url) = p_key)
      or exists (select 1 from appointments a
                   join cl on cl.id = a.client_id and cl.org_id = a.org_id
                  where a.recording_url like '%' || p_key || '%'
                    and r2_recording_key(a.recording_url) = p_key)
    when 'spacareer' then exists (
      select 1 from spacareer_session_videos v
       where v.org_id in (select org_id from me)
         and (v.storage_path = p_key or v.audio_storage_path = p_key))
    -- Zoomから移した録画：管理者は全員分、ページ権限のある人は自分がホストのものだけ
    when 'zoomcloud' then exists (
      select 1 from zoom_cloud_recordings z
       where z.r2_key = p_key and z.copied_at is not null
         and zoom_cloud_can_read(p_uid, z.org_id, z.host_email))
    else false
  end;
$function$;

-- 鍛冶さんにページ権限を付ける
insert into member_page_permissions (org_id, member_id, engagement_slug, page_key)
select m.org_id, m.id, 'spartia_career', 'zoom_recordings'
  from members m
 where m.id = '0f8dd077-cf7e-4dff-8dc3-6df6bf669f94'
   and not exists (select 1 from member_page_permissions p
                    where p.member_id = m.id and p.engagement_slug = 'spartia_career' and p.page_key = 'zoom_recordings');
