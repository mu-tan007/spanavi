-- クライアントごとのSlack/Chatwork連携情報
ALTER TABLE clients ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS chatwork_room_id TEXT;
