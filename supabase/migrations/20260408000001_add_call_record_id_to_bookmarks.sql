-- 録音ブックマークを call_records 単位でも保存できるように
ALTER TABLE recording_bookmarks ADD COLUMN IF NOT EXISTS call_record_id UUID;
ALTER TABLE recording_bookmarks ALTER COLUMN appointment_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recording_bookmarks_user_callrec
  ON recording_bookmarks(user_name, call_record_id) WHERE call_record_id IS NOT NULL;
