-- 管理者（users.role = 'admin'）が roleplay-recordings バケット内の
-- 任意パスにアップロード・更新できるポリシー

CREATE POLICY "admin insert roleplay recordings"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'roleplay-recordings'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  );

CREATE POLICY "admin update roleplay recordings"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'roleplay-recordings'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  );

CREATE POLICY "admin select roleplay recordings"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'roleplay-recordings'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  );
