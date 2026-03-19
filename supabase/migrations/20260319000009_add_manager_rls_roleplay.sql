-- チームリーダー・営業統括が担当メンバーのロープレ・研修進捗を参照できるポリシー
-- members.user_id = auth.uid() で現在ユーザーを特定し、position と team で権限を判定
-- ※ members テーブルの役職カラムは "role" ではなく "position"

-- ── roleplay_sessions ─────────────────────────────────────────────────────

-- チームリーダー: 自チームメンバーのセッションを SELECT
CREATE POLICY "team_leader_select_roleplay_sessions"
  ON roleplay_sessions FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT m.id FROM members m
      WHERE m.team = (
        SELECT team FROM members
        WHERE user_id = auth.uid()
          AND position = 'チームリーダー'
        LIMIT 1
      )
    )
  );

-- 営業統括: 全セッションを SELECT
CREATE POLICY "eigyo_tokatsu_select_roleplay_sessions"
  ON roleplay_sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE user_id = auth.uid()
        AND position = '営業統括'
    )
  );

-- ── training_progress ─────────────────────────────────────────────────────

-- チームリーダー: 自チームメンバーの研修進捗を SELECT
CREATE POLICY "team_leader_select_training_progress"
  ON training_progress FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT m.id FROM members m
      WHERE m.team = (
        SELECT team FROM members
        WHERE user_id = auth.uid()
          AND position = 'チームリーダー'
        LIMIT 1
      )
    )
  );

-- 営業統括: 全研修進捗を SELECT
CREATE POLICY "eigyo_tokatsu_select_training_progress"
  ON training_progress FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE user_id = auth.uid()
        AND position = '営業統括'
    )
  );
