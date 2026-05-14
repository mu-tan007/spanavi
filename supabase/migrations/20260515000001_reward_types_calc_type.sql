-- ============================================================
-- 報酬計算「件数×単価（定額）」型のサポート
--   2026-05-15
--   - reward_types に calc_type 列を追加（'rate' = 売上額×階段単価 / 'fixed_per_appo' = アポ1件 定額）
--   - 既存全 reward_types は calc_type='rate' （後方互換）
-- ============================================================
set local search_path = public, extensions;

ALTER TABLE reward_types
  ADD COLUMN IF NOT EXISTS calc_type text NOT NULL DEFAULT 'rate'
  CHECK (calc_type IN ('rate', 'fixed_per_appo'));

COMMENT ON COLUMN reward_types.calc_type IS
  '報酬計算方式: rate=売上額×階段単価（reward_tiers の lo/hi/price 階段）/ fixed_per_appo=アポ1件 単価固定（reward_tiers の price[0] を全件適用）';
