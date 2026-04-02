-- 担当者にカレンダーフィールド追加
ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS scheduling_url TEXT;

-- リストに担当者FK追加
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES client_contacts(id) ON DELETE SET NULL;

-- 既存データのバックフィル: clients → contacts にカレンダー情報コピー
UPDATE client_contacts cc
SET google_calendar_id = c.google_calendar_id, scheduling_url = c.scheduling_url
FROM clients c
WHERE cc.client_id = c.id AND c.google_calendar_id IS NOT NULL AND cc.google_calendar_id IS NULL;

-- 既存リストの担当者名からcontact_idを解決
UPDATE call_lists cl
SET contact_id = cc.id
FROM client_contacts cc
WHERE cl.client_id = cc.client_id AND cl.manager_name = cc.name AND cl.contact_id IS NULL;
