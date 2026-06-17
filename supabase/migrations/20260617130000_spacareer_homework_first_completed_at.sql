set local search_path = public, extensions;

-- ============================================================
-- 事後課題: 初回100%達成日時（first_completed_at）を記録
-- ------------------------------------------------------------
-- 提出期限の時点で100%だったかを管理画面で判定できるようにする。
-- submitted_at は再提出のたびに上書きされるため、期限内に到達したかの
-- 判定には使えない。そこで「初めて全項目を提出（100%）した日時」を
-- 一度だけ記録する first_completed_at を持たせる。
--   - 管理画面では first_completed_at と due_at を比較し、
--     期限内達成 / 期限後達成 / 期限内未達成 を表示する。
-- ============================================================
alter table public.spacareer_homework
  add column if not exists first_completed_at timestamptz;

comment on column public.spacareer_homework.first_completed_at is
  '初めて全項目を提出（100%）した日時。一度セットしたら上書きしない。提出期限内に100%到達したかの判定に使う。';

-- 既存の提出済み課題はバックフィル（再構築できないため submitted_at を初回達成とみなす）
update public.spacareer_homework
set first_completed_at = submitted_at
where first_completed_at is null
  and submitted_at is not null
  and status in ('submitted', 'completed');
