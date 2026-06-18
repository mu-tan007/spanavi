-- ============================================================
-- スパキャリ AI講座バケット: サムネイル画像(JPEG/PNG)のMIMEを許可
-- ----------------------------------------------------------------
-- spacareer-course-videos バケットは allowed_mime_types が動画のみに
-- 制限されており、サムネイル画像のアップロードがバケットに拒否され
-- thumbnail_path が常にnullになっていた（管理画面/受講生画面とも No image）。
-- 画像MIMEを許可に追加する。
-- ============================================================
set local search_path = public, extensions;

update storage.buckets
set allowed_mime_types = array[
  'video/mp4','video/quicktime','video/webm','video/x-matroska',
  'image/jpeg','image/png','image/webp'
]
where id = 'spacareer-course-videos';
