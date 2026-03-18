-- roleplay-recordings Storage バケット作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'roleplay-recordings',
  'roleplay-recordings',
  true,
  524288000,  -- 500MB
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: 認証済みユーザーは自分のフォルダにアップロード可能
CREATE POLICY "auth upload roleplay recordings"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'roleplay-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth read roleplay recordings"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'roleplay-recordings');
