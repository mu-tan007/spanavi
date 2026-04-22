-- Intake / Pipeline / Calendar / Emails ページ削除に伴う孤立テーブル撤去
DROP TABLE IF EXISTS cap_emails CASCADE;
DROP TABLE IF EXISTS cap_gcal_tokens CASCADE;
DROP TABLE IF EXISTS cap_gmail_sync_state CASCADE;
