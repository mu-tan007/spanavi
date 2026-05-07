-- =====================================================================
-- CRM Week 2-B: clients.next_contact_at 列を追加
--   一覧テーブルの「次回接点予定日」列の保存先
--   クライアント詳細ページから手動入力する想定（任意）
-- =====================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS next_contact_at timestamptz;
