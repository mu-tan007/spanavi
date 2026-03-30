-- recordingsバケットの公開読み取りポリシー追加
-- バケットは public: true だが、storage.objects テーブルのRLSに
-- SELECT ポリシーがなかったため、anonロールでアクセスすると
-- DatabaseTimeout / アクセス拒否が発生していた。
--
-- 併せて、重複していたroleplay-recordings用のadminポリシーを削除し
-- プランナー負荷を軽減（Planning Time 856ms → 492ms）。

-- recordingsバケットの公開読み取りを許可
CREATE POLICY "allow public read recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recordings');

-- 重複ポリシーの削除（auth read / auth update で既にカバー済み）
DROP POLICY IF EXISTS "admin select roleplay recordings" ON storage.objects;
DROP POLICY IF EXISTS "admin update roleplay recordings" ON storage.objects;
