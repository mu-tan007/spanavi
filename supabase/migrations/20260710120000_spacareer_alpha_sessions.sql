-- ============================================================
-- スパキャリ 応用コースの「プラスアルファ」連番化・権限・直案件解禁の見直し
-- ----------------------------------------------------------------
-- 変更点:
--  (1) 応用コースの part=2 セッションを「第N回(2)」ではなく独立連番「プラスアルファN」
--      として扱う。session_no は α番号(1..8)。過去回の穴埋め（虫食い）をやめ、
--      加入回 J(spacareer_customers.oyo_start_session_no) 以降に interleave して表示する。
--      ※ 既存 part=2 行は session_no=1..8 で作成済み＝そのままα番号として使える（値の移行不要）。
--  (2) コース変更 RPC(fn_spacareer_set_course) は篠宮・小山のみ実行可（サーバー側ガード）。
--      応用化時に J を記録する。
--  (3) 直案件DB閲覧権限(direct_db_access_granted_at)は「第4回完了(基本回)」で付与に変更
--      （従来は第3回完了で付与）。current_session_no / v_max は基本回(part=1)基準で判定。
-- ============================================================
set local search_path = public, extensions;

-- 1) 加入回 J 列 --------------------------------------------------------------
alter table public.spacareer_customers
  add column if not exists oyo_start_session_no smallint;

-- 2) 進捗再計算ヘルパー（第4回完了で直案件解禁 / v_max は基本回基準）----------
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
         coalesce(max(session_no) filter (where status = 'completed' and part = 1), 0),
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
      -- 第4回(基本回)完了で直案件DB閲覧を解禁（むー様指示 2026-07-10）
      direct_db_access_granted_at = case
        when v_max >= 4 and direct_db_access_granted_at is null then now()
        else direct_db_access_granted_at
      end
  where id = p_customer_id;
end;
$$;

-- 3) next_up 貼り直しヘルパー（新しい interleave 順で最若の未実施を1つ）--------
create or replace function public.fn_spacareer_reset_next_up(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_j smallint;
begin
  select coalesce(oyo_start_session_no, 1) into v_j
    from public.spacareer_customers where id = p_customer_id;

  update public.spacareer_sessions
    set status = 'not_started'
    where customer_id = p_customer_id and status = 'next_up';

  update public.spacareer_sessions
    set status = 'next_up'
    where id = (
      select id from public.spacareer_sessions
      where customer_id = p_customer_id and status = 'not_started'
      order by (case
                  when part = 1 then session_no * 100
                  when (v_j + session_no - 1) <= 8 then (v_j + session_no - 1) * 100 + 50
                  else 850 + session_no
                end) asc
      limit 1);
end;
$$;

-- 4) 新規受講生のセッション自動生成（応用は α1..8 と J=1 を用意）--------------
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
  -- 応用コースはプラスアルファ α1..8（part=2, session_no=α番号）を生成
  if new.course = 'oyo' then
    for i in 1..8 loop
      insert into public.spacareer_sessions (org_id, customer_id, session_no, part, status)
      values (new.org_id, new.id, i, 2, 'not_started')
      on conflict (customer_id, session_no, part) do nothing;
    end loop;
    update public.spacareer_customers
      set oyo_start_session_no = 1
      where id = new.id and oyo_start_session_no is null;
  end if;

  insert into public.spacareer_kickoff_checks (org_id, customer_id)
  values (new.org_id, new.id)
  on conflict (customer_id) do nothing;
  return new;
end;
$$;

-- 5) コース変更 RPC（篠宮・小山のみ / 応用化時に J を記録）--------------------
create or replace function public.fn_spacareer_set_course(p_customer_id uuid, p_course text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_org uuid;
  v_email text;
  i smallint;
begin
  -- コース/プラン変更は篠宮・小山のみ（むー様指示 2026-07-10）。
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null or v_email not in ('shinomiya@ma-sp.co', 'koyama@ma-sp.co') then
    raise exception 'コース変更権限がありません（篠宮・小山のみ変更できます）';
  end if;

  if p_course not in ('kyoka', 'oyo') then
    raise exception 'invalid course: %', p_course;
  end if;
  select org_id into v_org from public.spacareer_customers where id = p_customer_id;
  if v_org is null then
    raise exception 'spacareer customer not found: %', p_customer_id;
  end if;

  if p_course = 'oyo' then
    -- 応用化: 加入回 J＝現在の完了基本回の次（1..8）を記録し、α1..8 を用意（記録は保持）
    update public.spacareer_customers
      set course = 'oyo',
          oyo_start_session_no = least(8, greatest(1, coalesce(current_session_no, 0) + 1))
      where id = p_customer_id;
    for i in 1..8 loop
      insert into public.spacareer_sessions (org_id, customer_id, session_no, part, status)
      values (v_org, p_customer_id, i, 2, 'not_started')
      on conflict (customer_id, session_no, part) do nothing;
    end loop;
  else
    -- 強化化: 未実施(not_started/next_up)のα(part=2)のみ削除。実施済(completed)は残す。
    update public.spacareer_customers set course = 'kyoka' where id = p_customer_id;
    delete from public.spacareer_sessions
    where customer_id = p_customer_id and part = 2 and status <> 'completed';
  end if;

  perform public.fn_spacareer_recalc_progress(p_customer_id);
  perform public.fn_spacareer_reset_next_up(p_customer_id);
end;
$$;

grant execute on function public.fn_spacareer_set_course(uuid, text) to authenticated;

-- 6) 既存応用受講生の移行 -----------------------------------------------------
--   ・J を「現在の完了基本回の次」に設定（穴埋めをやめ、以降に interleave 表示）
--   ・next_up と進捗を新ロジックで貼り直す
update public.spacareer_customers
set oyo_start_session_no = least(8, greatest(1, coalesce(current_session_no, 0) + 1))
where course = 'oyo' and oyo_start_session_no is null;

do $$
declare
  r record;
begin
  for r in select id from public.spacareer_customers where course = 'oyo' loop
    perform public.fn_spacareer_recalc_progress(r.id);
    perform public.fn_spacareer_reset_next_up(r.id);
  end loop;
end $$;
