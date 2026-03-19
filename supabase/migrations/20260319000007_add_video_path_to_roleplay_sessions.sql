-- 動画ファイルのStorageパスを保存（署名付きURL生成用）
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS video_path text;
