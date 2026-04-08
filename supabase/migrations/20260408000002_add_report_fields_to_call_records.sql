-- 各架電レコードに通話レポート(スタイル/補足)を保存できるように
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS report_style TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS report_supplement TEXT;
