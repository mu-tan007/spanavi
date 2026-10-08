-- 実際に送ったアポ取得報告の本文（カレンダーの予定の説明に使う・2026-10-08）
alter table public.appointments add column if not exists report_sent_text text;
