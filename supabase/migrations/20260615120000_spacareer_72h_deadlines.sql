set local search_path = public, extensions;

-- ============================================================
-- スパキャリ 期限ルールの変更
-- ------------------------------------------------------------
-- 1. セッション感想(spacareer_session_feedbacks)
--    回答期限 = 受講生への通知（＝感想が利用可能になった）時刻 + 72時間。
--    旧仕様（次回セッション-3日）から変更。次回リスケに連動しない（通知起点のため）。
-- 2. 事後課題(spacareer_homework)
--    提出期限 = 次回セッション実施予定の 72時間前。
--    旧仕様（次回-3日 23:59）から変更。次回セッションのリスケに連動して追従。
-- ============================================================

-- ------------------------------------------------------------
-- 1-a. 感想に「通知時刻」カラムを追加（72h カウントダウンの起点）
-- ------------------------------------------------------------
alter table public.spacareer_session_feedbacks
  add column if not exists notified_at timestamptz;
comment on column public.spacareer_session_feedbacks.notified_at is
  '受講生に感想が通知（利用可能化）された時刻。回答期限=notified_at+72h の起点。';

-- ------------------------------------------------------------
-- 1-b. 感想の自動生成トリガを「通知時刻 + 72時間」に変更
-- ------------------------------------------------------------
create or replace function public.fn_spacareer_create_session_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
    select 1 from public.spacareer_session_feedbacks where session_id = new.id
  ) then
    return new;
  end if;

  insert into public.spacareer_session_feedbacks
    (org_id, customer_id, session_id, notified_at, due_at)
  values
    (new.org_id, new.customer_id, new.id, now(), now() + interval '72 hours');

  return new;
end;
$$;

-- 1-c. 感想は通知起点になったので、次回セッションのリスケ追従トリガは不要 → 撤去
drop trigger if exists trg_spacareer_sync_feedback_due on public.spacareer_sessions;
drop function if exists public.fn_spacareer_sync_feedback_due_on_reschedule();

-- 1-d. 既存の未提出感想を 通知(なければ作成)時刻 + 72時間 へ backfill
update public.spacareer_session_feedbacks
set notified_at = coalesce(notified_at, created_at),
    due_at      = coalesce(notified_at, created_at) + interval '72 hours'
where submitted_at is null;

-- ------------------------------------------------------------
-- 2-a. 事後課題の期限を「次回セッション実施予定の72時間前」に追従させるトリガ
--      （次回セッションの scheduled_at 変更時、その前のセッションの課題期限を更新）
-- ------------------------------------------------------------
create or replace function public.fn_spacareer_sync_homework_due_on_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.spacareer_homework h
  set due_at = new.scheduled_at - interval '72 hours'
  where h.customer_id = new.customer_id
    and h.session_no = new.session_no - 1
    and h.status <> 'completed';
  return new;
end;
$$;

drop trigger if exists trg_spacareer_sync_homework_due on public.spacareer_sessions;
create trigger trg_spacareer_sync_homework_due
  after update of scheduled_at on public.spacareer_sessions
  for each row
  when (new.scheduled_at is distinct from old.scheduled_at and new.scheduled_at is not null)
  execute function public.fn_spacareer_sync_homework_due_on_reschedule();

-- 2-b. 既存の事後課題を「次回セッション実施予定の72時間前」へ backfill
update public.spacareer_homework h
set due_at = nxt.scheduled_at - interval '72 hours'
from public.spacareer_sessions nxt
where nxt.customer_id = h.customer_id
  and nxt.session_no = h.session_no + 1
  and nxt.scheduled_at is not null
  and h.status <> 'completed';
