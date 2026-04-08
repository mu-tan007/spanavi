-- Speed up range search (start_no/end_no) on call_list_items.
-- LiveStatusView の fetchCalledCountForSession で
-- WHERE list_id = ? AND no BETWEEN ? AND ? のクエリが頻発するため、
-- (list_id, no) の複合インデックスを追加する。
--
-- 注意: CONCURRENTLY を使うためトランザクション外で実行すること。
-- 本番適用は低トラフィック時間帯（深夜）に行う。

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_list_items_list_no
  ON call_list_items (list_id, no);
