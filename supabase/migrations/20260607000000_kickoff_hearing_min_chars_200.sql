-- ============================================================
-- キックオフヒアリング 設問の最低文字数を 300 → 200 に緩和
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-social-style-onboarding.md（運用調整）
--
-- 経緯:
--   D. 動機・価値観の深掘り / E. 過去の経験 / H. 未来像 セクション内の
--   一部設問が min_chars=300 で要求しており、受講生にとって負担感が大きい
--   との運用フィードバック。一律 200 に引き下げて緩和。
-- ============================================================

set local search_path = public, extensions;

UPDATE public.spacareer_kickoff_hearing_questions
SET min_chars = 200,
    updated_at = now()
WHERE is_active = true
  AND min_chars = 300;
