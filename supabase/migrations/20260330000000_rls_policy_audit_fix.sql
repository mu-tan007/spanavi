-- ============================================================
-- RLSポリシー棚卸し: 全テーブルの読み書きポリシーを網羅的に確認・修正
-- 日付: 2026-03-30
-- ============================================================

-- ============================================================
-- 1. members UPDATE ポリシー修正 [CRITICAL]
--    問題: ハードコード org_id = 'a0000000-...' → 動的 get_user_org_id() に修正
-- ============================================================
DROP POLICY IF EXISTS "authenticated_update_members_avatar" ON public.members;
DROP POLICY IF EXISTS "members_update_own_org" ON public.members;

CREATE POLICY "members_update_own_org"
  ON public.members FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

-- ============================================================
-- 2. call_records DELETE ポリシー追加 [CRITICAL]
--    問題: SELECT/INSERT/UPDATE はあるが DELETE が欠落
-- ============================================================
DROP POLICY IF EXISTS "call_records_delete_own_org" ON public.call_records;

CREATE POLICY "call_records_delete_own_org"
  ON public.call_records FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id());

-- ============================================================
-- 3. call_list_items INSERT/UPDATE/DELETE ポリシー追加 [CRITICAL]
--    問題: SELECT のみで書き込み系が全て欠落
-- ============================================================
DROP POLICY IF EXISTS "call_list_items_insert_own_org" ON public.call_list_items;
DROP POLICY IF EXISTS "call_list_items_update_own_org" ON public.call_list_items;
DROP POLICY IF EXISTS "call_list_items_delete_own_org" ON public.call_list_items;

CREATE POLICY "call_list_items_insert_own_org"
  ON public.call_list_items FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "call_list_items_update_own_org"
  ON public.call_list_items FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "call_list_items_delete_own_org"
  ON public.call_list_items FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id());

-- ============================================================
-- 4. training_progress / roleplay_sessions admin ポリシーに org_id 追加 [CRITICAL]
--    問題: users.role='admin' のみで全テナントのデータにアクセス可能
-- ============================================================
DROP POLICY IF EXISTS "admin_training_progress" ON public.training_progress;
DROP POLICY IF EXISTS "admin_roleplay_sessions" ON public.roleplay_sessions;

CREATE POLICY "admin_training_progress"
  ON public.training_progress FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  );

CREATE POLICY "admin_roleplay_sessions"
  ON public.roleplay_sessions FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
        AND public.users.role = 'admin'
    )
  );

-- ============================================================
-- 5. training_progress / roleplay_sessions マネージャーポリシーに org_id 追加 [CRITICAL]
--    問題: チームリーダー・営業統括が org_id チェックなしでアクセス
-- ============================================================

-- チームリーダー: roleplay_sessions
DROP POLICY IF EXISTS "team_leader_select_roleplay_sessions" ON public.roleplay_sessions;

CREATE POLICY "team_leader_select_roleplay_sessions"
  ON public.roleplay_sessions FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND user_id IN (
      SELECT m.id FROM public.members m
      WHERE m.org_id = public.get_user_org_id()
        AND m.team = (
          SELECT team FROM public.members
          WHERE user_id = auth.uid()
            AND position = 'チームリーダー'
          LIMIT 1
        )
    )
  );

-- 営業統括: roleplay_sessions
DROP POLICY IF EXISTS "eigyo_tokatsu_select_roleplay_sessions" ON public.roleplay_sessions;

CREATE POLICY "eigyo_tokatsu_select_roleplay_sessions"
  ON public.roleplay_sessions FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.members
      WHERE user_id = auth.uid()
        AND org_id = public.get_user_org_id()
        AND position = '営業統括'
    )
  );

-- チームリーダー: training_progress
DROP POLICY IF EXISTS "team_leader_select_training_progress" ON public.training_progress;

CREATE POLICY "team_leader_select_training_progress"
  ON public.training_progress FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND user_id IN (
      SELECT m.id FROM public.members m
      WHERE m.org_id = public.get_user_org_id()
        AND m.team = (
          SELECT team FROM public.members
          WHERE user_id = auth.uid()
            AND position = 'チームリーダー'
          LIMIT 1
        )
    )
  );

-- 営業統括: training_progress
DROP POLICY IF EXISTS "eigyo_tokatsu_select_training_progress" ON public.training_progress;

CREATE POLICY "eigyo_tokatsu_select_training_progress"
  ON public.training_progress FOR SELECT TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.members
      WHERE user_id = auth.uid()
        AND org_id = public.get_user_org_id()
        AND position = '営業統括'
    )
  );

-- ============================================================
-- 6. users テーブルの SELECT ポリシーを自分のレコードのみに制限 [HIGH]
--    問題: using(true) で全テナントのユーザー情報が公開
--    注: users テーブルは useAuth.jsx の fetchProfile でのみ使用
--        .eq('id', userId) で自分のレコードのみ取得しているため
--        ポリシーを id = auth.uid() に制限しても影響なし
-- ============================================================
DROP POLICY IF EXISTS "Public read name email role" ON public.users;
DROP POLICY IF EXISTS "users_select_own" ON public.users;

CREATE POLICY "users_select_own"
  ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ============================================================
-- 7. reward_types / reward_tiers の RLS 確実化 [HIGH]
--    問題: org_id カラム存在時のみ条件付き RLS 有効化だった
--    org_id カラムがなければ追加し、RLS を確実に有効化する
-- ============================================================

-- reward_types: org_id カラム追加（なければ）+ RLS 確実化
DO $$
BEGIN
  -- org_id カラムがなければ追加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reward_types' AND column_name = 'org_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.reward_types ADD COLUMN org_id uuid DEFAULT ''a0000000-0000-0000-0000-000000000001''';
  END IF;

  -- RLS 有効化（既に有効でもエラーにならない）
  EXECUTE 'ALTER TABLE public.reward_types ENABLE ROW LEVEL SECURITY';

  -- 既存ポリシーを削除して再作成
  EXECUTE 'DROP POLICY IF EXISTS "reward_types_select_own_org" ON public.reward_types';
  EXECUTE 'DROP POLICY IF EXISTS "reward_types_insert_own_org" ON public.reward_types';
  EXECUTE 'DROP POLICY IF EXISTS "reward_types_update_own_org" ON public.reward_types';
  EXECUTE 'DROP POLICY IF EXISTS "reward_types_delete_own_org" ON public.reward_types';

  EXECUTE 'CREATE POLICY "reward_types_select_own_org" ON public.reward_types FOR SELECT TO authenticated USING (org_id = public.get_user_org_id())';
  EXECUTE 'CREATE POLICY "reward_types_insert_own_org" ON public.reward_types FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_org_id())';
  EXECUTE 'CREATE POLICY "reward_types_update_own_org" ON public.reward_types FOR UPDATE TO authenticated USING (org_id = public.get_user_org_id()) WITH CHECK (org_id = public.get_user_org_id())';
  EXECUTE 'CREATE POLICY "reward_types_delete_own_org" ON public.reward_types FOR DELETE TO authenticated USING (org_id = public.get_user_org_id())';
END $$;

-- reward_tiers: org_id カラム追加（なければ）+ RLS 確実化
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reward_tiers' AND column_name = 'org_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.reward_tiers ADD COLUMN org_id uuid DEFAULT ''a0000000-0000-0000-0000-000000000001''';
  END IF;

  EXECUTE 'ALTER TABLE public.reward_tiers ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "reward_tiers_select_own_org" ON public.reward_tiers';
  EXECUTE 'DROP POLICY IF EXISTS "reward_tiers_insert_own_org" ON public.reward_tiers';
  EXECUTE 'DROP POLICY IF EXISTS "reward_tiers_update_own_org" ON public.reward_tiers';
  EXECUTE 'DROP POLICY IF EXISTS "reward_tiers_delete_own_org" ON public.reward_tiers';

  EXECUTE 'CREATE POLICY "reward_tiers_select_own_org" ON public.reward_tiers FOR SELECT TO authenticated USING (org_id = public.get_user_org_id())';
  EXECUTE 'CREATE POLICY "reward_tiers_insert_own_org" ON public.reward_tiers FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_org_id())';
  EXECUTE 'CREATE POLICY "reward_tiers_update_own_org" ON public.reward_tiers FOR UPDATE TO authenticated USING (org_id = public.get_user_org_id()) WITH CHECK (org_id = public.get_user_org_id())';
  EXECUTE 'CREATE POLICY "reward_tiers_delete_own_org" ON public.reward_tiers FOR DELETE TO authenticated USING (org_id = public.get_user_org_id())';
END $$;

-- ============================================================
-- 8. org-logos ストレージに org_id 制約追加 [HIGH]
--    問題: 認証済みなら誰でもアップロード・上書き可能
--    修正: フォルダ名 = org_id で自組織のロゴのみ操作可能に
--    フロントエンド: BrandingSettings.jsx で path = `${orgId}/logo.${ext}` を使用
-- ============================================================
DROP POLICY IF EXISTS "org_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_logos_update" ON storage.objects;

CREATE POLICY "org_logos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

CREATE POLICY "org_logos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

-- ============================================================
-- 検証用: 修正後のポリシーカバレッジ確認クエリ（実行はしない）
-- ============================================================
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
