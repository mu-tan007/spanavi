set local search_path = public, extensions;

-- スパキャリ セッション動画のAI議事録パイプライン強化:
-- 動画(〜2GB)をそのままWhisperに渡せないため、ブラウザ側で抽出した
-- MP3音声を別オブジェクトとしてアップロードし、そのパスを保持する。
alter table public.spacareer_session_videos
  add column if not exists audio_storage_path text;

comment on column public.spacareer_session_videos.audio_storage_path is
  'ブラウザでffmpeg.wasm抽出したWhisper用MP3のStorageパス（動画と同じバケット）。NULLの場合は動画本体を冒頭truncateして文字起こしする';

-- バケットは video/* のみ許可だったため、抽出音声のMIMEを追加で許可する
update storage.buckets
set allowed_mime_types = array[
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'
]
where id = 'spacareer-session-videos';
