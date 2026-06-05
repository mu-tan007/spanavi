-- 架電リストの「企業概要」にPDFを複数添付できるようにする
-- ストレージは既存の script-pdfs バケットを overview/ プレフィックスで間借りするため、
-- バケット追加と storage policy の変更は不要。

set local search_path = public, extensions;

ALTER TABLE call_lists
  ADD COLUMN IF NOT EXISTS company_overview_pdfs jsonb NOT NULL DEFAULT '[]'::jsonb;
