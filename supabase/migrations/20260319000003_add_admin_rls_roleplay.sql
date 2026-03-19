-- 管理者（users.role = 'admin'）が全ユーザーの研修・ロープレレコードにアクセスできるポリシー
-- public.users テーブルでは id = auth.uid()

CREATE POLICY "admin_training_progress"
  ON training_progress FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  );

CREATE POLICY "admin_roleplay_sessions"
  ON roleplay_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  );
