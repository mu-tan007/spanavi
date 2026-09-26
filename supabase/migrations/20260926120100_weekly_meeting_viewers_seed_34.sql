-- 第34回（2026-09-26）の出席者。Zoomの参加者レポートから
insert into public.weekly_meeting_viewers (video_id, member_id, org_id, reason, created_by)
select v.id, m.id, v.org_id, 'attended', null
  from public.weekly_meeting_videos v
  join public.members m on m.org_id = v.org_id and m.is_active
 where v.meeting_date = date '2026-09-26'
   and m.name in ('瀬尾 貫太','畑 環','興村 重貴','奥野 大翔','石井 佑弥','浅井 佑','北川 恭太郎')
on conflict (video_id, member_id) do nothing;
