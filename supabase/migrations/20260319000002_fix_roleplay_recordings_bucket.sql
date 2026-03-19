-- MIME タイプ制限を解除（.mov など全形式を許可）、サイズ上限も撤廃
UPDATE storage.buckets
SET allowed_mime_types = NULL,
    file_size_limit = NULL
WHERE id = 'roleplay-recordings';

-- upsert（UPDATE）用のポリシーを追加
CREATE POLICY "auth update roleplay recordings"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'roleplay-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 自分のファイルを削除できるポリシーも追加
CREATE POLICY "auth delete roleplay recordings"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'roleplay-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
