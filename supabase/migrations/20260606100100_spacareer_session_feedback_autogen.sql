-- ============================================================
-- スパキャリ セッション感想 自動生成トリガ
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-social-style-onboarding.md Phase 5
--
-- 経緯:
--   セッション完了 (spacareer_sessions.status='completed') 時に
--   spacareer_session_feedbacks 行を自動生成する仕組みが未実装だった。
--   結果、ClientFeedbackView で「現在回答可能なセッション感想はありません」
--   が常態化していた。
--
-- 内容:
--   1. セッション完了時に feedback 行を自動 insert（全 session_no 対象、第0回キックオフも含む）
--   2. due_at は完了から 7日後（仕様書 §6.3）
--   3. 既存稼働セッション（既に completed_at がセットされた行）への backfill
--      → 小山テストデータの第0回キックオフが対象
-- ============================================================

set local search_path = public, extensions;

-- ============================================================
-- 1. feedback 行 自動生成関数
-- ============================================================
create or replace function public.fn_spacareer_create_session_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- 既に feedback 行が存在するならスキップ（重複防止）
  if exists (
    select 1 from public.spacareer_session_feedbacks
    where session_id = new.id
  ) then
    return new;
  end if;

  insert into public.spacareer_session_feedbacks (
    org_id, customer_id, session_id, due_at
  ) values (
    new.org_id,
    new.customer_id,
    new.id,
    coalesce(new.completed_at, now()) + interval '7 days'
  );

  return new;
end;
$$;

comment on function public.fn_spacareer_create_session_feedback() is
  'セッション完了時に spacareer_session_feedbacks の行を自動生成（第0回キックオフ含む）。回答期限は完了から7日後。';

drop trigger if exists trg_spacareer_create_session_feedback on public.spacareer_sessions;
create trigger trg_spacareer_create_session_feedback
  after update of status, completed_at on public.spacareer_sessions
  for each row
  when (
    new.status = 'completed'
    and (old.status is distinct from 'completed' or old.completed_at is null)
  )
  execute function public.fn_spacareer_create_session_feedback();

-- ============================================================
-- 2. 既存セッション（status='completed' 済）の backfill
-- ----------------------------------------------------------------
-- 既に完了済みなのに feedback 行を持たないセッションを救済。
-- ============================================================
insert into public.spacareer_session_feedbacks (org_id, customer_id, session_id, due_at)
select
  s.org_id,
  s.customer_id,
  s.id,
  coalesce(s.completed_at, now()) + interval '7 days'
from public.spacareer_sessions s
where s.status = 'completed'
  and not exists (
    select 1 from public.spacareer_session_feedbacks sf
    where sf.session_id = s.id
  );
