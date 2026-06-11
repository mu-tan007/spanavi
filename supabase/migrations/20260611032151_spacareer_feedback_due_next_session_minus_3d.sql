set local search_path = public, extensions;

-- ============================================================
-- セッション感想の回答期限を「次回セッションの3日前」に変更
-- ----------------------------------------------------------------
-- 旧仕様: 完了から7日後。
-- 新仕様: 当該セッションの「次のセッション」の開始予定日時の3日前。
--   キックオフ(第0回)感想 → 第1回セッション日の3日前。
--   第N回感想 → 第N+1回セッション日の3日前。
-- 次回予定が未設定の場合のみ、従来どおり完了+7日をフォールバックに使う。
-- ============================================================

-- 1. feedback 作成トリガ
create or replace function public.fn_spacareer_create_session_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_next_scheduled timestamptz;
  v_due timestamptz;
begin
  if exists (
    select 1 from public.spacareer_session_feedbacks where session_id = new.id
  ) then
    return new;
  end if;

  select s.scheduled_at into v_next_scheduled
  from public.spacareer_sessions s
  where s.customer_id = new.customer_id
    and s.session_no = new.session_no + 1
  limit 1;

  if v_next_scheduled is not null then
    v_due := v_next_scheduled - interval '3 days';
  else
    v_due := coalesce(new.completed_at, now()) + interval '7 days';
  end if;

  insert into public.spacareer_session_feedbacks (org_id, customer_id, session_id, due_at)
  values (new.org_id, new.customer_id, new.id, v_due);

  return new;
end;
$$;

-- 2. 次回セッションの予定日時が変わったら、前回セッションの感想期限を3日前へ追従させる
create or replace function public.fn_spacareer_sync_feedback_due_on_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.spacareer_session_feedbacks sf
  set due_at = new.scheduled_at - interval '3 days'
  from public.spacareer_sessions prev
  where prev.customer_id = new.customer_id
    and prev.session_no = new.session_no - 1
    and sf.session_id = prev.id
    and sf.submitted_at is null;
  return new;
end;
$$;

drop trigger if exists trg_spacareer_sync_feedback_due on public.spacareer_sessions;
create trigger trg_spacareer_sync_feedback_due
  after update of scheduled_at on public.spacareer_sessions
  for each row
  when (new.scheduled_at is distinct from old.scheduled_at and new.scheduled_at is not null)
  execute function public.fn_spacareer_sync_feedback_due_on_reschedule();

-- 3. 既存の未提出 feedback を「次回セッションの3日前」へ backfill（次回予定があるもの）
update public.spacareer_session_feedbacks sf
set due_at = nxt.scheduled_at - interval '3 days'
from public.spacareer_sessions s
join public.spacareer_sessions nxt
  on nxt.customer_id = s.customer_id and nxt.session_no = s.session_no + 1
where sf.session_id = s.id
  and sf.submitted_at is null
  and nxt.scheduled_at is not null;
