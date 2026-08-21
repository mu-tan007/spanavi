-- ============================================================
-- スパキャリ 第1回事後課題を「全て変動課題」に統一（むー様 2026-08-21）
-- ------------------------------------------------------------
-- これまで第1回だけは spacareer_templates.template_type='homework_1' の
-- 固定26問（STEP1〜STEP8＋「私の人生の地図」提出）をセッション完了時に
-- 自動配信していた。第2回以降と同じく「トレーナーがAIで変動課題を生成→修正→
-- 追加公開」の形に統一するため、第1回の特別扱いを廃止する。
--
-- 変更後の第1回:
--   セッション完了 → 事後課題の器（spacareer_homework）だけ作られ、
--   固定課題は spacareer_homework_fixed_items（第1回は未登録＝0件）から取る。
--   中身はセッション管理タブの「変動課題」エディタでAI生成→追加公開する。
--
-- 注記: 本ファイルは同時に、リポジトリに未記録だった現行本番の構成
--   （セッション完了トリガー trg_spacareer_publish_fixed_homework →
--     fn_spacareer_publish_fixed_homework_for_session、cron はその取りこぼし救済）
--   をそのまま記述し、リポジトリと本番の定義を一致させる。
-- 既に固定公開済み（fixed_published_at あり）の回は何も変更しない＝
--   既存受講生の第1回課題・回答はそのまま残る。
-- ============================================================
set local search_path = public, extensions;
set local lock_timeout = '5s';

-- 1セッション分の固定事後課題を公開する（冪等）。
create or replace function public.fn_spacareer_publish_fixed_homework_for_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_homework_id uuid;
  v_due timestamptz;
  v_next_sched timestamptz;
  v_pos int;
begin
  select s.id as session_id, s.org_id, s.customer_id, s.session_no, s.part, s.status
    into r
  from public.spacareer_sessions s
  where s.id = p_session_id;

  if r.session_id is null then
    return;
  end if;

  -- 対象は基本回(part=1)の第1〜8回・完了済みのみ。キックオフ(0)・プラスアルファ(part=2)は事後課題なし。
  if r.part <> 1 or r.session_no < 1 or r.session_no > 8 or r.status <> 'completed' then
    return;
  end if;

  -- 既に固定公開済みなら何もしない（冪等）。
  if exists (
    select 1 from public.spacareer_homework h
    where h.customer_id = r.customer_id
      and h.session_no = r.session_no
      and h.fixed_published_at is not null
  ) then
    return;
  end if;

  select scheduled_at into v_next_sched
  from public.spacareer_sessions
  where customer_id = r.customer_id and session_no = r.session_no + 1 and part = 1;
  if v_next_sched is not null and v_next_sched > now() then
    v_due := v_next_sched - interval '72 hours';
  else
    v_due := now() + interval '7 days';
  end if;

  insert into public.spacareer_homework
    (org_id, customer_id, session_id, session_no, status, notified_at, fixed_published_at, due_at)
  values
    (r.org_id, r.customer_id, r.session_id, r.session_no, 'unsubmitted', now(), now(), v_due)
  on conflict (customer_id, session_no) do update set
    notified_at = coalesce(public.spacareer_homework.notified_at, now()),
    fixed_published_at = now(),
    status = case when public.spacareer_homework.status in ('partial','submitted','completed')
                  then public.spacareer_homework.status else 'unsubmitted' end,
    due_at = coalesce(public.spacareer_homework.due_at, excluded.due_at),
    updated_at = now()
  returning id into v_homework_id;

  -- 固定課題は全ての回（第1〜8回）で spacareer_homework_fixed_items から取る。
  -- 第1回は固定マスター未登録＝0件になり、中身は変動課題エディタで作る。
  if not exists (
    select 1 from public.spacareer_homework_items
    where homework_id = v_homework_id and source = 'fixed'
  ) then
    v_pos := coalesce((select max(position) from public.spacareer_homework_items where homework_id = v_homework_id), 0);

    insert into public.spacareer_homework_items
      (org_id, homework_id, position, section, question_text, question_hint,
       is_required, max_length, item_type, template_url, template_name, source, is_published)
    select r.org_id, v_homework_id,
           v_pos + row_number() over (order by fi.position),
           fi.section, fi.question_text, fi.question_hint,
           fi.is_required, null, coalesce(fi.item_type, 'text'),
           fi.template_url, fi.template_name, 'fixed', true
    from public.spacareer_homework_fixed_items fi
    where fi.org_id = r.org_id and fi.session_no = r.session_no and fi.is_active = true;
  end if;
end;
$$;

-- セッション完了(status='completed')で即時公開するトリガー関数。
create or replace function public.tg_spacareer_publish_fixed_homework()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.fn_spacareer_publish_fixed_homework_for_session(new.id);
  return new;
end;
$$;

-- 本番には同名トリガーが既にある（定義は同一）。作り直すと spacareer_sessions に
-- ACCESS EXCLUSIVE ロックがかかるため、無いときだけ作る。
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_spacareer_publish_fixed_homework'
      and tgrelid = 'public.spacareer_sessions'::regclass
  ) then
    create trigger trg_spacareer_publish_fixed_homework
    after update of status on public.spacareer_sessions
    for each row
    when (new.status = 'completed' and new.part = 1 and new.session_no between 1 and 8)
    execute function public.tg_spacareer_publish_fixed_homework();
  end if;
end $$;

-- cron から呼ばれる救済用。トリガーの取りこぼし（直接UPDATE等）を拾う。
create or replace function public.fn_spacareer_publish_due_fixed()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  -- 感想: 完了回のみ公開（トリガー取りこぼしの救済）
  insert into public.spacareer_session_feedbacks (org_id, customer_id, session_id, notified_at, due_at)
  select s.org_id, s.customer_id, s.id, now(), now() + interval '72 hours'
  from public.spacareer_sessions s
  where s.session_no between 1 and 8
    and s.status = 'completed'
    and not exists (
      select 1 from public.spacareer_session_feedbacks f where f.session_id = s.id
    );

  -- 固定事後課題: 完了回のみ公開（トリガー取りこぼしの救済）
  for r in
    select s.id
    from public.spacareer_sessions s
    where s.session_no between 1 and 8
      and s.part = 1
      and s.status = 'completed'
      and not exists (
        select 1 from public.spacareer_homework h
        where h.customer_id = s.customer_id
          and h.session_no = s.session_no
          and h.fixed_published_at is not null
      )
  loop
    perform public.fn_spacareer_publish_fixed_homework_for_session(r.id);
  end loop;
end;
$$;
