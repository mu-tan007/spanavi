-- ユーザーが自分の録音ファイルに対して署名付きURLを生成できるよう SELECT を許可
CREATE POLICY "users_select_own_roleplay_recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'roleplay-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
