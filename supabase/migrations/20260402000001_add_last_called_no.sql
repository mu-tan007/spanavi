-- セッション内で最後に架電した企業の番号を追跡
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS last_called_no integer;
