-- 事前確認の記録の取り消し（2026-10-04）
-- インターン本人（または管理者）が、篠宮がまだ報告を送っていない記録を取り消せる。
-- 取り消すと、その記録で作った下書きを消し、アポの状態を記録する前に戻し、#事前確認 の返信に「取り消し済み」と付ける。
-- 同じアポの他の記録（1回目・2回目の不在など）はそのまま残る。
set lock_timeout = '5s';
alter table public.precheck_events add column if not exists cancelled_at timestamptz;
alter table public.precheck_events add column if not exists cancelled_by text;
-- 記録した時点のアポの状態（取り消したときに戻すため）
alter table public.precheck_events add column if not exists prev_appo jsonb;
