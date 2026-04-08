-- アポレポートにスタイル(Smooth/Slack/説得)と補足を追加
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS report_style TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS report_supplement TEXT;

-- 録音ブックマーク
CREATE TABLE IF NOT EXISTS recording_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  user_name TEXT NOT NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  recording_url TEXT NOT NULL,
  company_name TEXT,
  getter_name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_name, appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_recording_bookmarks_user
  ON recording_bookmarks(user_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recording_bookmarks_appo
  ON recording_bookmarks(appointment_id);

ALTER TABLE recording_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recording_bookmarks_all ON recording_bookmarks;
CREATE POLICY recording_bookmarks_all ON recording_bookmarks
  FOR ALL
  USING (org_id = 'a0000000-0000-0000-0000-000000000001')
  WITH CHECK (org_id = 'a0000000-0000-0000-0000-000000000001');
