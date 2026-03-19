-- ロープレセッションに動画URL列を追加（サムネイル・再生用）
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS video_url text;
