-- 幽霊セッション（finished_at NULL かつ 3時間以上非活動）を自動クローズする関数
CREATE OR REPLACE FUNCTION close_stale_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE call_sessions
  SET finished_at = COALESCE(last_called_at, started_at) + INTERVAL '1 second'
  WHERE finished_at IS NULL
    AND COALESCE(last_called_at, started_at) < NOW() - INTERVAL '3 hours';

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;
