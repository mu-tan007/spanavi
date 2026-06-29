-- ============================================================
-- スパキャリ セッションに「Zoom録画 共有リンク」を追加
-- ----------------------------------------------------------------
-- むー様指示 2026-06-29:
--   動画ファイルをアップロードしなくても、Zoomの共有可能リンクを各回ごとに
--   貼り付けて管理画面側で録画を視聴できるようにする。
--   既存の spacareer_sessions.zoom_url は「会議URL」用途のため、録画の共有リンクは
--   別カラム recording_url として持つ（各回=spacareer_sessions 1行で自然に回別管理）。
-- 注: 視聴専用リンク。AI議事録は従来どおりアップロード動画/音声から生成する。
-- ============================================================
set local search_path = public, extensions;

alter table public.spacareer_sessions
  add column if not exists recording_url text;

comment on column public.spacareer_sessions.recording_url is
  'Zoom等の録画 共有リンク（視聴専用）。各回ごとに管理画面で貼り付け・閲覧する。AI議事録には使わない。';
