-- ============================================================
-- 研修進捗 & ロープレセッション テーブル
-- ============================================================

-- training_progress: 各研修ステージの完了状態を管理
CREATE TABLE IF NOT EXISTS training_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  user_id uuid NOT NULL,
  stage_key text NOT NULL,       -- 'day1_philosophy' | 'day1_workflow' | 'day2_final'
  completed boolean DEFAULT false,
  completed_at timestamptz,
  passed boolean,                -- day2_final のみ使用（合格/不合格）
  completed_by text,             -- 完了させた管理者名
  notes text,
  UNIQUE(user_id, stage_key)
);

-- roleplay_sessions: 各ロープレセッションの記録
CREATE TABLE IF NOT EXISTS roleplay_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  user_id uuid NOT NULL,
  partner_name text,
  session_type text NOT NULL,    -- 'training_day2_member' | 'training_day2_final' | 'weekly'
  session_date date,
  passed boolean,
  recording_path text,
  recording_url text,
  transcript text,
  ai_feedback jsonb,             -- {overall, issues, solutions, practice}
  ai_status text DEFAULT 'none', -- 'none' | 'processing' | 'done' | 'error'
  notes text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleplay_sessions ENABLE ROW LEVEL SECURITY;

-- 自分のレコードのみ操作可能
CREATE POLICY "own_training_progress" ON training_progress
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "own_roleplay_sessions" ON roleplay_sessions
  FOR ALL USING (user_id = auth.uid());

-- インデックス
CREATE INDEX IF NOT EXISTS idx_training_progress_user_id ON training_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_sessions_user_id ON roleplay_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_roleplay_sessions_type ON roleplay_sessions(user_id, session_type);
