-- Phase A patch: Caesar DB と cap_* の列差分を埋める
-- 初回 capital_integration migration 後、Caesar 実運用での後追いカラム追加分を反映

ALTER TABLE cap_deal_companies
  ADD COLUMN IF NOT EXISTS detailed_summary text,
  ADD COLUMN IF NOT EXISTS detailed_summary_updated_at timestamptz;

ALTER TABLE cap_deal_contracts
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS counterparty text,
  ADD COLUMN IF NOT EXISTS amount bigint,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS executed_at date;

ALTER TABLE cap_deal_files
  ADD COLUMN IF NOT EXISTS starred boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dd_category text,
  ADD COLUMN IF NOT EXISTS version_group text,
  ADD COLUMN IF NOT EXISTS version_label text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS uploader_note text;

ALTER TABLE cap_deal_qa
  ADD COLUMN IF NOT EXISTS asked_at timestamptz,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE cap_deal_valuations
  ADD COLUMN IF NOT EXISTS hope_price bigint,
  ADD COLUMN IF NOT EXISTS hope_price_note text;

-- Storage buckets (Caesar と同名で作成、RLS は service_role のみアクセス想定)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('caesar-files', 'caesar-files', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('email_attachments', 'email_attachments', false)
  ON CONFLICT (id) DO NOTHING;
