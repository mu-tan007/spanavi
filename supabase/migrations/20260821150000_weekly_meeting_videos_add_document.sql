-- 週次ミーティングの回ごとにPDF資料を1つ紐づける。
-- 実体は既存の weekly-meetings バケットの docs/ 配下に置く（動画と同じ置き場）。
set local lock_timeout = '3s';

alter table public.weekly_meeting_videos
  add column if not exists document_path       text,
  add column if not exists document_name       text,
  add column if not exists document_size_bytes bigint,
  add column if not exists document_url        text;

comment on column public.weekly_meeting_videos.document_path is
  'weekly-meetings バケット内のPDFのパス（docs/<org_id>/...）。削除時に消すために持つ';
comment on column public.weekly_meeting_videos.document_name is '元のファイル名（画面表示用）';
comment on column public.weekly_meeting_videos.document_url  is '公開URL。資料ボタンから開く';

-- バケットは動画のMIMEしか許可していないため、PDFを足さないと無言で弾かれる
update storage.buckets
   set allowed_mime_types = array(
         select distinct unnest(allowed_mime_types || array['application/pdf'])
       )
 where id = 'weekly-meetings';
