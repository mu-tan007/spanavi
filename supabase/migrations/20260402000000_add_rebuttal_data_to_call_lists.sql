-- リストごとのアウト返しデータ（JSON text）
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS rebuttal_data text;
