-- ============================================================
-- spacareer_ai_usage_logs.feature CHECK 拡張
-- ----------------------------------------------------------------
-- §8.7 キックオフヒアリングAI抽出のコスト計測用に2値追加:
--   kickoff_highlight   - 重要発言ハイライトTop5抽出
--   kickoff_deep_dive   - 深掘り候補3つ提案
-- 既存6値は維持。
-- ============================================================

set local search_path = public, extensions;

alter table public.spacareer_ai_usage_logs
  drop constraint if exists spacareer_ai_usage_logs_feature_check;

alter table public.spacareer_ai_usage_logs
  add constraint spacareer_ai_usage_logs_feature_check
  check (feature in (
    'minutes_generation',
    'homework_30items',
    'social_style',
    'strength_diagnosis',
    'phrase_extraction',
    'daily_message',
    'kickoff_highlight',
    'kickoff_deep_dive'
  ));
