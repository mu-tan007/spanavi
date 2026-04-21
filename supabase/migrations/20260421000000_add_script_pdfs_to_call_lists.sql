-- クライアント別スクリプトのPDF添付機能
-- 1. call_lists.script_pdfs jsonb列を追加（配列: [{path, name, size, uploaded_at}]）
-- 2. script-pdfs privateバケットを作成
-- 3. storage.objectsのSELECTホワイトリストを更新

ALTER TABLE call_lists
  ADD COLUMN IF NOT EXISTS script_pdfs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- script-pdfs バケット（private, 20MB, application/pdfのみ）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'script-pdfs',
  'script-pdfs',
  false,
  20971520,  -- 20MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- SELECTホワイトリスト更新（既存の統合ポリシーに script-pdfs を追加）
DROP POLICY IF EXISTS "storage_select_all_buckets" ON storage.objects;

CREATE POLICY "storage_select_all_buckets"
  ON storage.objects FOR SELECT
  USING (bucket_id IN (
    'recordings',
    'profile-images',
    'org-logos',
    'library-docs',
    'roleplay-recordings',
    'script-pdfs'
  ));
