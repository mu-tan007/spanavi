-- アポ取得報告の「ご依頼」をアポ一覧で書く（空なら録音からAIが拾ったもの・「なし」も書ける）2026-10-08
alter table public.appointments add column if not exists client_requests text;
