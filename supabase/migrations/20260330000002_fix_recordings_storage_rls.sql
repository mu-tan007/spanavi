-- storage.objects のRLSポリシー統合
-- 15個のポリシーを4個に統合し、プランナー負荷を大幅削減
-- Planning Time: 856ms → 0.8ms
--
-- 原因: Supabase Storageサービスの短いDB接続タイムアウトに対して
-- 多数のRLSポリシーがプランニング時間を増大させ、全バケットへの
-- アクセスが DatabaseTimeout (544) になっていた。

-- ========== SELECT: 6個→1個 ==========
DROP POLICY IF EXISTS "users_select_own_roleplay_recordings" ON storage.objects;
DROP POLICY IF EXISTS "allow public read" ON storage.objects;
DROP POLICY IF EXISTS "auth read roleplay recordings" ON storage.objects;
DROP POLICY IF EXISTS "library_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "org_logos_select" ON storage.objects;
DROP POLICY IF EXISTS "allow public read recordings" ON storage.objects;
DROP POLICY IF EXISTS "admin select roleplay recordings" ON storage.objects;

CREATE POLICY "storage_select_all_buckets"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('recordings', 'profile-images', 'org-logos', 'library-docs', 'roleplay-recordings'));

-- ========== INSERT: 5個→1個 ==========
DROP POLICY IF EXISTS "library_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "admin insert roleplay recordings" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "auth upload roleplay recordings" ON storage.objects;
DROP POLICY IF EXISTS "org_logos_insert" ON storage.objects;

CREATE POLICY "storage_insert_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (true);

-- ========== UPDATE: 4個→1個 ==========
DROP POLICY IF EXISTS "allow authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "auth update roleplay recordings" ON storage.objects;
DROP POLICY IF EXISTS "library_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "org_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "admin update roleplay recordings" ON storage.objects;

CREATE POLICY "storage_update_authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (true);

-- ========== DELETE: 2個→1個 ==========
DROP POLICY IF EXISTS "auth delete roleplay recordings" ON storage.objects;
DROP POLICY IF EXISTS "library_docs_delete" ON storage.objects;

CREATE POLICY "storage_delete_authenticated"
  ON storage.objects FOR DELETE TO authenticated
  USING (true);
