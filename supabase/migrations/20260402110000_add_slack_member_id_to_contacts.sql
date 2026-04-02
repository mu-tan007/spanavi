-- 担当者ごとのSlackメンバーID（メンション用）
ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS slack_member_id TEXT;
