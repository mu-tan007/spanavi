-- =====================================================================
-- CRM Week 5: 新規開拓パイプライン用テーブル群
--   1. client_lead_lists      - 開拓リスト（CSVインポート単位、業界別など）
--   2. client_lead_companies  - リスト内の対象企業（CSV各行）
--   3. client_call_records    - 開拓架電の履歴（既存 call_records とは独立）
--
-- 業務フロー:
--   CSVインポート → 開拓リスト作成 → 各企業を架電 → アポ獲得時に
--   clients テーブルへ転記（status='面談予定'）し、promoted_to_client_id で紐付け
-- =====================================================================

-- 1. 開拓リスト
CREATE TABLE IF NOT EXISTS public.client_lead_lists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  name            text NOT NULL,                    -- リスト名（例: 製造業 関東 50件）
  industry        text,                              -- 業界（任意）
  script_body     text,                              -- 業界別トークスクリプト
  is_archived     boolean NOT NULL DEFAULT false,
  imported_at     timestamptz NOT NULL DEFAULT now(),
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cll_org_archived
  ON public.client_lead_lists(org_id, is_archived, imported_at DESC);

-- 2. リスト内企業（CSV 各行）
CREATE TABLE IF NOT EXISTS public.client_lead_companies (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL,
  list_id                  uuid NOT NULL REFERENCES public.client_lead_lists(id) ON DELETE CASCADE,
  no                       integer,
  company                  text NOT NULL,
  representative           text,
  business                 text,
  address                  text,
  prefecture               text,
  phone                    text,
  email                    text,
  website                  text,
  -- アポ獲得時に clients に新規行作成、その client_id をここに保持
  promoted_to_client_id    uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  promoted_at              timestamptz,
  notes                    text,
  is_excluded              boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clc_org_list
  ON public.client_lead_companies(org_id, list_id, no);
CREATE INDEX IF NOT EXISTS idx_clc_promoted
  ON public.client_lead_companies(promoted_to_client_id)
  WHERE promoted_to_client_id IS NOT NULL;

-- 3. 開拓架電の履歴
CREATE TABLE IF NOT EXISTS public.client_call_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL,
  list_id             uuid NOT NULL REFERENCES public.client_lead_lists(id) ON DELETE CASCADE,
  lead_company_id     uuid NOT NULL REFERENCES public.client_lead_companies(id) ON DELETE CASCADE,
  round               integer NOT NULL,             -- 周回数（1, 2, 3...）
  status              text NOT NULL,                -- 'absent','keyman_absent','keyman_connect',
                                                    -- 'appointment','reception_block','reception_recall',
                                                    -- 'keyman_recall','rejected','inquiry_form','excluded'
  memo                text,
  recording_url       text,
  getter_name         text,
  called_at           timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccr_org_called
  ON public.client_call_records(org_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccr_lead_company
  ON public.client_call_records(lead_company_id, round);

-- =====================================================================
-- 共通トリガー: updated_at 自動更新（lists のみ）
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_cll_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_cll_updated_at ON public.client_lead_lists;
CREATE TRIGGER trg_cll_updated_at
  BEFORE UPDATE ON public.client_lead_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_cll_updated_at();

-- =====================================================================
-- RLS: 全テーブル共通で get_user_org_id() ベース
-- =====================================================================
ALTER TABLE public.client_lead_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_lead_companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_call_records    ENABLE ROW LEVEL SECURITY;

-- client_lead_lists
DROP POLICY IF EXISTS cll_select ON public.client_lead_lists;
CREATE POLICY cll_select ON public.client_lead_lists FOR SELECT TO authenticated USING (org_id = get_user_org_id());
DROP POLICY IF EXISTS cll_insert ON public.client_lead_lists;
CREATE POLICY cll_insert ON public.client_lead_lists FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id());
DROP POLICY IF EXISTS cll_update ON public.client_lead_lists;
CREATE POLICY cll_update ON public.client_lead_lists FOR UPDATE TO authenticated USING (org_id = get_user_org_id());
DROP POLICY IF EXISTS cll_delete ON public.client_lead_lists;
CREATE POLICY cll_delete ON public.client_lead_lists FOR DELETE TO authenticated USING (org_id = get_user_org_id());

-- client_lead_companies
DROP POLICY IF EXISTS clc_select ON public.client_lead_companies;
CREATE POLICY clc_select ON public.client_lead_companies FOR SELECT TO authenticated USING (org_id = get_user_org_id());
DROP POLICY IF EXISTS clc_insert ON public.client_lead_companies;
CREATE POLICY clc_insert ON public.client_lead_companies FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id());
DROP POLICY IF EXISTS clc_update ON public.client_lead_companies;
CREATE POLICY clc_update ON public.client_lead_companies FOR UPDATE TO authenticated USING (org_id = get_user_org_id());
DROP POLICY IF EXISTS clc_delete ON public.client_lead_companies;
CREATE POLICY clc_delete ON public.client_lead_companies FOR DELETE TO authenticated USING (org_id = get_user_org_id());

-- client_call_records
DROP POLICY IF EXISTS ccr_select ON public.client_call_records;
CREATE POLICY ccr_select ON public.client_call_records FOR SELECT TO authenticated USING (org_id = get_user_org_id());
DROP POLICY IF EXISTS ccr_insert ON public.client_call_records;
CREATE POLICY ccr_insert ON public.client_call_records FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id());
DROP POLICY IF EXISTS ccr_update ON public.client_call_records;
CREATE POLICY ccr_update ON public.client_call_records FOR UPDATE TO authenticated USING (org_id = get_user_org_id());
DROP POLICY IF EXISTS ccr_delete ON public.client_call_records;
CREATE POLICY ccr_delete ON public.client_call_records FOR DELETE TO authenticated USING (org_id = get_user_org_id());
