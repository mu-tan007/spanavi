-- active_calls テーブルのRLSポリシー修正
-- 旧ポリシーは members.id = auth.uid() でマッチしており、
-- members.id はauth UIDではないため常に不一致で0件を返していた。
-- get_user_org_id() を使う正しいパターンに修正。

DROP POLICY IF EXISTS "active_calls_org_read" ON active_calls;
DROP POLICY IF EXISTS "active_calls_org_insert" ON active_calls;

-- SELECT: 自分のorg_idのレコードのみ読み取り可能
CREATE POLICY "active_calls_select_own_org"
  ON active_calls FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- INSERT: service_role経由（Zoom Webhook）で使うため全許可
CREATE POLICY "active_calls_insert_all"
  ON active_calls FOR INSERT
  WITH CHECK (true);

-- UPDATE: service_role経由（Zoom Webhook）でステータス更新
CREATE POLICY "active_calls_update_all"
  ON active_calls FOR UPDATE
  USING (true);

-- DELETE: クリーンアップ用
CREATE POLICY "active_calls_delete_all"
  ON active_calls FOR DELETE
  USING (true);
