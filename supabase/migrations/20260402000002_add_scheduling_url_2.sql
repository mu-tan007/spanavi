-- 担当者に2つ目の日程調整URLとラベルを追加
ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS scheduling_url_2 text DEFAULT '';
ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS scheduling_label text DEFAULT '';
ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS scheduling_label_2 text DEFAULT '';
