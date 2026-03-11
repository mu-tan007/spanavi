-- パフォーマンス改善用インデックス
-- Supabase SQL Editor で実行するか、supabase db push で適用してください。

-- call_records テーブル
CREATE INDEX IF NOT EXISTS idx_call_records_called_at
  ON call_records(called_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_records_getter_name
  ON call_records(getter_name);

CREATE INDEX IF NOT EXISTS idx_call_records_org_id
  ON call_records(org_id);

CREATE INDEX IF NOT EXISTS idx_call_records_org_called
  ON call_records(org_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_records_org_getter
  ON call_records(org_id, getter_name, called_at DESC);

-- call_list_items テーブル
CREATE INDEX IF NOT EXISTS idx_call_list_items_company
  ON call_list_items(company);

CREATE INDEX IF NOT EXISTS idx_call_list_items_org_id
  ON call_list_items(org_id);

CREATE INDEX IF NOT EXISTS idx_call_list_items_org_company
  ON call_list_items(org_id, company);

-- appointments テーブル
CREATE INDEX IF NOT EXISTS idx_appointments_org_id
  ON appointments(org_id);

CREATE INDEX IF NOT EXISTS idx_appointments_meeting_date
  ON appointments(meeting_date);

-- members テーブル
CREATE INDEX IF NOT EXISTS idx_members_org_id
  ON members(org_id);

CREATE INDEX IF NOT EXISTS idx_members_user_id
  ON members(user_id);

-- 確認クエリ
-- SELECT indexname, tablename
-- FROM pg_indexes
-- WHERE tablename IN ('call_records', 'call_list_items', 'appointments', 'members')
-- AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
