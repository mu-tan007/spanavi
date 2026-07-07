-- ============================================================
-- キックオフ(第0回)のセッション感想を撤廃
-- ----------------------------------------------------------------
-- 完了時に感想(spacareer_session_feedbacks)行を作らないようにする。
-- 既存のキックオフ感想の履歴は残す（管理画面で確認可能）。
-- 第1回以降は従来どおり感想を作成する。
-- ============================================================
set local search_path = public, extensions;

create or replace function public.fn_spacareer_create_session_feedback()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  -- キックオフ(第0回)は感想を作成しない
  if new.session_no = 0 then
    return new;
  end if;

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
