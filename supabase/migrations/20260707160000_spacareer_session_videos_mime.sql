-- ============================================================
-- spacareer-session-videos バケットの許可MIMEを拡張
-- ----------------------------------------------------------------
-- キックオフ/セッションの録画は m4a(audio/x-m4a) 等 多様な形式で来るため、
-- allowed_mime_types に audio/x-m4a などが無いと TUS アップロードが 415 で失敗する
-- （"mime type audio/x-m4a is not supported"）。動画・音声の一般的なMIMEを許可する。
-- update は該当バケットが無ければ 0 行更新で無害（エラーにならない）。
-- ============================================================
update storage.buckets
set allowed_mime_types = array[
  'video/mp4','video/quicktime','video/webm','video/x-matroska','video/mpeg',
  'video/x-msvideo','video/3gpp','video/x-ms-wmv','video/x-flv','video/avi',
  'audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/ogg',
  'audio/x-m4a','audio/m4a','audio/aac','audio/x-aac','audio/flac','audio/x-wav','audio/3gpp'
]
where id = 'spacareer-session-videos';
