-- 架電中フラグ（finished_at IS NULL）が残留しているセッションをクリア
-- 対象：本日より前に開始して finished_at が NULL のままのセッション

-- ① クリア対象を確認（実行前に件数チェック）
-- SELECT id, caller_name, list_name, started_at
-- FROM call_sessions
-- WHERE finished_at IS NULL
--   AND started_at < (NOW() AT TIME ZONE 'Asia/Tokyo')::date;

-- ② 本日より前の残留セッションをすべてクリア
UPDATE call_sessions
SET finished_at = started_at + INTERVAL '4 hours'
WHERE finished_at IS NULL
  AND started_at < (NOW() AT TIME ZONE 'Asia/Tokyo')::date;

-- ③ 本日の残留セッション（5時間以上前に開始）もクリア
UPDATE call_sessions
SET finished_at = started_at + INTERVAL '4 hours'
WHERE finished_at IS NULL
  AND started_at < NOW() - INTERVAL '5 hours';
