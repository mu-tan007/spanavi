-- 週次ミーティング動画（ライブラリ）: UPDATE ポリシーが存在せず、
-- タイトル・開催日の編集や Cloudflare Stream の変換完了ステータス反映が
-- RLS で 0 行更新のまま素通りしていた。
-- SELECT / INSERT / DELETE と同じ org スコープで UPDATE を許可する。
drop policy if exists wmv_update_own_org on public.weekly_meeting_videos;
create policy wmv_update_own_org on public.weekly_meeting_videos
  for update
  using (org_id = get_user_org_id())
  with check (org_id = get_user_org_id());
