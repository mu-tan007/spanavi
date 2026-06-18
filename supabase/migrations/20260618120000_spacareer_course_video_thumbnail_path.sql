-- ============================================================
-- スパキャリ AI講座動画: 自動サムネイル保存用カラム追加
-- ----------------------------------------------------------------
-- 動画の冒頭フレームから生成した JPEG を非公開バケット
-- (spacareer-course-videos) 内に保存し、その object path を保持する。
-- 表示時は署名付きURLで配信する。
-- 既存 thumbnail_url(手入力フルURL) は上書き用フォールバックとして残す。
-- ============================================================
set local search_path = public, extensions;

alter table public.spacareer_course_videos
  add column if not exists thumbnail_path text;

comment on column public.spacareer_course_videos.thumbnail_path is
  'AI講座動画の自動生成サムネイルのStorage object path（非公開バケット）。表示は署名付きURL。手入力thumbnail_urlがあればそちらを優先。';
