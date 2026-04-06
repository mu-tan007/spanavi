-- 複数担当者対応: contact_ids UUID[] カラム追加
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS contact_ids UUID[] DEFAULT '{}';

-- 既存 contact_id からバックフィル
UPDATE call_lists
SET contact_ids = ARRAY[contact_id]
WHERE contact_id IS NOT NULL AND (contact_ids IS NULL OR contact_ids = '{}');

-- GINインデックス
CREATE INDEX IF NOT EXISTS idx_call_lists_contact_ids ON call_lists USING GIN (contact_ids);
