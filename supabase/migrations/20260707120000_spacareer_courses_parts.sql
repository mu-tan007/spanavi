-- ============================================================
-- スパキャリ コース選択・プラン変更の柔軟化（各回(1)(2)パート分割）
-- ----------------------------------------------------------------
-- ・コース: spacareer_customers.course（'kyoka'=強化8回 / 'oyo'=応用16回）
-- ・各回に part(1,2) を持たせ、強化=part1のみ / 応用=part1+2（第0回キックオフは常にpart1）
-- ・コース変更（強化⇄応用）は既存セッション記録を保持したまま (N,2) を増減
-- ・未実施の (N,2) は任意順で後から補填可能（進行は手動選択＋next_upヒント）
-- ・進捗/卒業判定は「その受講生の全セッション数」基準（強化=9で従来と一致）
--
-- 既存データ: 全員 course='kyoka'（default）、全既存セッション part=1（default）。
--            → デフォルトにより現行挙動を完全維持（挙動変化なし）。
-- ============================================================
set local search_path = public, extensions;

-- 1) コース列（受講生ごと）------------------------------------------------
alter table public.spacareer_customers
  add column if not exists course text not null default 'kyoka';
alter table public.spacareer_customers
  drop constraint if exists spacareer_customers_course_check;
alter table public.spacareer_customers
  add constraint spacareer_customers_course_check check (course in ('kyoka', 'oyo'));

-- 2) セッションのパート列 -------------------------------------------------
alter table public.spacareer_sessions
  add column if not exists part smallint not null default 1;
alter table public.spacareer_sessions
  drop constraint if exists spacareer_sessions_part_check;
alter table public.spacareer_sessions
  add constraint spacareer_sessions_part_check check (part in (1, 2));

-- ユニークを (customer_id, session_no) → (customer_id, session_no, part) に
alter table public.spacareer_sessions
  drop constraint if exists spacareer_sessions_customer_id_session_no_key;
alter table public.spacareer_sessions
  drop constraint if exists spacareer_sessions_customer_id_session_no_part_key;
alter table public.spacareer_sessions
  add constraint spacareer_sessions_customer_id_session_no_part_key
  unique (customer_id, session_no, part);

-- 3) 進捗再計算ヘルパー（トリガーとコース変更RPCで共用）--------------------
-- 進捗 = 完了数 / その受講生の全セッション数。強化(9)なら従来(=/9)と一致。
create or replace function public.fn_spacareer_recalc_progress(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_completed int;
  v_max smallint;
  v_total int;
begin
  select count(*) filter (where status = 'completed')::int,
         coalesce(max(session_no) filter (where status = 'completed'), 0),
         count(*)::int
    into v_completed, v_max, v_total
  from public.spacareer_sessions
  where customer_id = p_customer_id;

  update public.spacareer_customers
  set current_session_no = v_max,
      progress_percent = case when v_total > 0
        then round((v_completed::numeric / v_total) * 100, 2) else 0 end,
      status = case
        when v_total > 0 and v_completed >= v_total then 'graduated'
        when v_completed >= 1 then 'in_progress'
        else status
      end,
      direct_db_access_granted_at = case
        when v_max >= 3 and direct_db_access_granted_at is null then now()
        else direct_db_access_granted_at
      end
  where id = p_customer_id;
end;
$$;

-- 4) next_up ヒント張り直しヘルパー -------------------------------------
-- 補填運用のため「次に実施する回」は最も若い未実施(session_no,part順)を1つだけ next_up に。
-- 実施回は管理画面で手動選択できるため、これは強制ではなく目安。
create or replace function public.fn_spacareer_reset_next_up(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  update public.spacareer_sessions
    set status = 'not_started'
    where customer_id = p_customer_id and status = 'next_up';
  update public.spacareer_sessions
    set status = 'next_up'
    where id = (
      select id from public.spacareer_sessions
      where customer_id = p_customer_id and status = 'not_started'
      order by session_no, part
      limit 1);
end;
$$;

-- 5) 既存トリガー関数を course/part 対応に置換 ---------------------------

-- 5-1) セッション自動生成（新規受講生作成時）
create or replace function public.fn_spacareer_create_customer_sessions()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  i smallint;
begin
  -- 第0回(キックオフ)＋第1〜8回の part1 は全コース共通
  for i in 0..8 loop
    insert into public.spacareer_sessions (org_id, customer_id, session_no, part, status)
    values (new.org_id, new.id, i, 1, case when i = 0 then 'next_up' else 'not_started' end)
    on conflict (customer_id, session_no, part) do nothing;
  end loop;
  -- 応用コースは各回の part2 も生成
  if new.course = 'oyo' then
    for i in 1..8 loop
      insert into public.spacareer_sessions (org_id, customer_id, session_no, part, status)
      values (new.org_id, new.id, i, 2, 'not_started')
      on conflict (customer_id, session_no, part) do nothing;
    end loop;
  end if;

  insert into public.spacareer_kickoff_checks (org_id, customer_id)
  values (new.org_id, new.id)
  on conflict (customer_id) do nothing;
  return new;
end;
$$;

-- 5-2) 進捗同期（完了時）→ ヘルパーへ委譲
create or replace function public.fn_spacareer_sync_customer_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  perform public.fn_spacareer_recalc_progress(new.customer_id);
  return new;
end;
$$;

-- 5-3) 次回 next_up 前進（完了時）→ 最も若い未実施を1つ next_up に
create or replace function public.fn_spacareer_advance_next_session()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  perform public.fn_spacareer_reset_next_up(new.customer_id);
  return new;
end;
$$;

-- 6) コース変更 RPC（記録を保持したまま (N,2) を増減）-------------------
create or replace function public.fn_spacareer_set_course(p_customer_id uuid, p_course text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_org uuid;
  i smallint;
begin
  if p_course not in ('kyoka', 'oyo') then
    raise exception 'invalid course: %', p_course;
  end if;
  select org_id into v_org from public.spacareer_customers where id = p_customer_id;
  if v_org is null then
    raise exception 'spacareer customer not found: %', p_customer_id;
  end if;

  update public.spacareer_customers set course = p_course where id = p_customer_id;

  if p_course = 'oyo' then
    -- 強化→応用: 不足している (N,2) を not_started で追加（既存記録は保持=引き継ぎ）
    for i in 1..8 loop
      insert into public.spacareer_sessions (org_id, customer_id, session_no, part, status)
      values (v_org, p_customer_id, i, 2, 'not_started')
      on conflict (customer_id, session_no, part) do nothing;
    end loop;
  else
    -- 応用→強化: 未実施(not_started/next_up)の (N,2) のみ削除。実施済(completed)は残す。
    delete from public.spacareer_sessions
    where customer_id = p_customer_id and part = 2 and status <> 'completed';
  end if;

  perform public.fn_spacareer_recalc_progress(p_customer_id);
  perform public.fn_spacareer_reset_next_up(p_customer_id);
end;
$$;

grant execute on function public.fn_spacareer_set_course(uuid, text) to authenticated;
