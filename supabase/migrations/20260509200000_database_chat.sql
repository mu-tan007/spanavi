-- =====================================================================
-- Database 画面 自然言語チャット検索 用テーブル
--   - database_chat_sessions   : チャットセッション（タイトル＝最新条件の要約）
--   - database_chat_messages   : セッション内の発話（user / assistant）
--   - saved_company_searches   : 保存した検索条件
--
-- 設計方針:
--   - org_id を保持し、RLS は user_id = auth.uid() で個人スコープに統一
--     （他ユーザーの会話・保存検索は見えない。同 org の管理者でも他人の履歴は不可視）
--   - filters_json は INITIAL_FILTERS と同じシェイプを期待
-- =====================================================================

set local search_path = public, extensions;

-- 1. チャットセッション
CREATE TABLE IF NOT EXISTS database_chat_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  user_id uuid NOT NULL,
  title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_database_chat_sessions_user
  ON database_chat_sessions(user_id, updated_at DESC);

ALTER TABLE database_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_database_chat_sessions" ON database_chat_sessions;
CREATE POLICY "own_database_chat_sessions" ON database_chat_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. チャットメッセージ
CREATE TABLE IF NOT EXISTS database_chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES database_chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  filters_json jsonb,           -- assistant メッセージのみ。提案された検索条件
  needs_clarification boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_database_chat_messages_session
  ON database_chat_messages(session_id, created_at);

ALTER TABLE database_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_database_chat_messages" ON database_chat_messages;
CREATE POLICY "own_database_chat_messages" ON database_chat_messages
  FOR ALL USING (
    session_id IN (SELECT id FROM database_chat_sessions WHERE user_id = auth.uid())
  ) WITH CHECK (
    session_id IN (SELECT id FROM database_chat_sessions WHERE user_id = auth.uid())
  );

-- 3. 保存した検索条件
CREATE TABLE IF NOT EXISTS saved_company_searches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  user_id uuid NOT NULL,
  name text NOT NULL,
  filters_json jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_company_searches_user
  ON saved_company_searches(user_id, created_at DESC);

ALTER TABLE saved_company_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_saved_company_searches" ON saved_company_searches;
CREATE POLICY "own_saved_company_searches" ON saved_company_searches
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- updated_at 自動更新トリガ（sessions のみ）
CREATE OR REPLACE FUNCTION public.touch_database_chat_session()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_database_chat_session ON database_chat_sessions;
CREATE TRIGGER trg_touch_database_chat_session
  BEFORE UPDATE ON database_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_database_chat_session();
