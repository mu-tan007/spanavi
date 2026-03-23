-- Phase 1: メール送信 + カレンダー連携のためのスキーマ変更

-- 1a. clients テーブルに列追加
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS scheduling_url TEXT;

-- 1b. appointments テーブルに承認ワークフロー列追加
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'pending';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS email_approved_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
