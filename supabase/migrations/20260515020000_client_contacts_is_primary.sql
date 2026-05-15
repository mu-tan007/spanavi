-- =====================================================================
-- client_contacts.is_primary 追加 hotfix
-- ---------------------------------------------------------------------
-- 経緯:
--   2026-04-28 の Phase 1 マイグレーション (20260428000000) で is_primary
--   を追加する予定だったが本番DBには未適用のままコードだけが先行デプロイ
--   され、CRM 新規担当者追加で schema cache エラーが発生していた。
--   既存の contact_memo_events 用ポリシーが手動で本番に入っているため
--   Phase 1 全体を再適用すると衝突する。is_primary だけを最小範囲で追加。
--
-- 変更:
--   1) client_contacts.is_primary BOOLEAN NOT NULL DEFAULT FALSE
--   2) 部分 unique index: client_id 単位で is_primary=TRUE は最大 1 行
--   3) バックフィル: 主担当が居ないクライアントは最古の担当者を主担当に
-- =====================================================================

SET LOCAL search_path = public, extensions;

-- 1) is_primary カラム
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) 1 クライアントにつき主担当は最大 1 名
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_one_primary_per_client
  ON public.client_contacts (client_id)
  WHERE is_primary = TRUE;

-- 3) バックフィル: 主担当未設定クライアントに最古の担当者を割り当て
WITH ranked AS (
  SELECT
    id,
    client_id,
    ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at, id) AS rn
  FROM public.client_contacts
),
needs_primary AS (
  SELECT DISTINCT client_id
  FROM public.client_contacts
  WHERE client_id NOT IN (
    SELECT client_id FROM public.client_contacts WHERE is_primary = TRUE
  )
)
UPDATE public.client_contacts c
SET is_primary = TRUE
FROM ranked r
WHERE c.id = r.id
  AND r.rn = 1
  AND c.client_id IN (SELECT client_id FROM needs_primary);
