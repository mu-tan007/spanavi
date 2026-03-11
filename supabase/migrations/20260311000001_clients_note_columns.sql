-- clientsテーブルにkickoff/regularミーティングメモ列を追加
-- CRMViewの「キックオフミーティング時」「定期ミーティング時」フィールド対応

alter table public.clients
  add column if not exists note_kickoff text,
  add column if not exists note_regular text;
