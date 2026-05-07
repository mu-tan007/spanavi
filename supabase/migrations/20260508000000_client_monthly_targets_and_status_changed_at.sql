-- =====================================================================
-- CRM Week 2-A 用マイグレーション
--   1. client_monthly_targets テーブル新設（月別目標）
--   2. clients.status_changed_at 列追加（成約数集計用）
--   3. 既存 clients.supply_target を当月（2026-05）の月別目標として初期コピー
-- =====================================================================

-- 1. client_monthly_targets テーブル
CREATE TABLE IF NOT EXISTS public.client_monthly_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  year_month    text NOT NULL,                     -- 'YYYY-MM' 形式
  target_count  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, year_month),
  CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  CHECK (target_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_cmt_org_year_month
  ON public.client_monthly_targets(org_id, year_month);
CREATE INDEX IF NOT EXISTS idx_cmt_client_id
  ON public.client_monthly_targets(client_id);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION public.set_cmt_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cmt_updated_at ON public.client_monthly_targets;
CREATE TRIGGER trg_cmt_updated_at
  BEFORE UPDATE ON public.client_monthly_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_cmt_updated_at();

-- RLS
ALTER TABLE public.client_monthly_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cmt_select_own_org ON public.client_monthly_targets;
CREATE POLICY cmt_select_own_org
  ON public.client_monthly_targets FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS cmt_insert_own_org ON public.client_monthly_targets;
CREATE POLICY cmt_insert_own_org
  ON public.client_monthly_targets FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS cmt_update_own_org ON public.client_monthly_targets;
CREATE POLICY cmt_update_own_org
  ON public.client_monthly_targets FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS cmt_delete_own_org ON public.client_monthly_targets;
CREATE POLICY cmt_delete_own_org
  ON public.client_monthly_targets FOR DELETE TO authenticated
  USING (org_id = get_user_org_id());


-- 2. clients.status_changed_at 列追加
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;


-- 3. 既存 clients.supply_target を当月の月別目標として初期コピー
--    （> 0 のもののみ。NULL や 0 はスキップ）
INSERT INTO public.client_monthly_targets (org_id, client_id, year_month, target_count)
SELECT org_id, id, '2026-05', supply_target
FROM public.clients
WHERE supply_target IS NOT NULL AND supply_target > 0
ON CONFLICT (client_id, year_month) DO NOTHING;
