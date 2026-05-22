-- =====================================================================
-- 商材・タイプ複数選択をサーバー側で適用するため、 各 RPC に
-- p_engagement_ids uuid[] 引数を追加（既存の p_engagement_id は維持）
--
-- 経緯: 商材選択時にクライアント側で post-filter していたため、
--       total が rows.length (≤200) で上書きされ、 ②全業種×全ステータス
--       で 200件しかヒットしないバグになっていた。
--
-- 対象: smart_queue_detailed_query / _ids
--       smart_queue_industry_status_combo / _ids
--       smart_queue_keyman_rejections / _ids
-- =====================================================================

set local search_path = public, extensions;

-- ... 各RPCのbody内の where 句に
-- and (p_engagement_ids is null or 該当.engagement_id = any(p_engagement_ids))
-- を追加。 詳細は本日のmigration applyで適用済。
-- このファイルはマイグレーション履歴用に残す。

-- (内容は applyMigration smart_queue_engagement_ids_array 参照)
