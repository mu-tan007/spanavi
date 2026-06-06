-- ============================================================
-- キックオフ管理 ヒアリングシート チェックリスト 新仕様
-- ----------------------------------------------------------------
-- 仕様変更点（運用合意 2026-06-07）:
--   - 「全額返金ポリシーの説明」は契約書読み合わせで実施済みのため除外
--   - 「スケジュール調整の完了」は個別の日程確定（第1回開始日時 + 第2-8回全回仮日程）で代替するため削除
--   - 「次回のセッション内容についての説明」（事前課題/セッション感想/締切）を細分化
--   - 「キックオフスライド」「ログイン説明」「AIコミュニティ」「AI講座」の説明項目を追加
--
-- 既存カラムの扱い:
--   - check_refund_policy / check_schedule_done / check_session_content / check_weekly_pace は
--     UI から外すが、DB は残す（既存データを破壊しない）
-- ============================================================

set local search_path = public, extensions;

alter table public.spacareer_kickoff_checks
  add column if not exists check_slide_explained boolean not null default false,
  add column if not exists check_login_explained boolean not null default false,
  add column if not exists check_ai_community boolean not null default false,
  add column if not exists check_ai_course boolean not null default false,
  add column if not exists check_next_session_content boolean not null default false,
  add column if not exists check_pre_assignment boolean not null default false,
  add column if not exists check_session_feedback boolean not null default false,
  add column if not exists check_deadline boolean not null default false;

comment on column public.spacareer_kickoff_checks.check_slide_explained      is 'キックオフスライドの説明完了';
comment on column public.spacareer_kickoff_checks.check_login_explained      is 'スパナビのログイン説明完了';
comment on column public.spacareer_kickoff_checks.check_ai_community         is 'AIコミュニティについての説明完了';
comment on column public.spacareer_kickoff_checks.check_ai_course            is 'AI講座についての説明完了';
comment on column public.spacareer_kickoff_checks.check_next_session_content is '次回のセッション内容についての説明完了';
comment on column public.spacareer_kickoff_checks.check_pre_assignment       is '事前課題についての説明完了';
comment on column public.spacareer_kickoff_checks.check_session_feedback     is 'セッション感想についての説明完了';
comment on column public.spacareer_kickoff_checks.check_deadline             is '締め切りについての説明完了';
