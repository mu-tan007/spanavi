-- 自動卒業は fn_spacareer_recalc_progress に既にあった（全コマ完了で status='graduated'）。
-- 20260803130000 で足した trg_spacareer_graduate_on_last_session は、同じ完了処理の後段で
-- この関数に status を上書きされるため機能しない。二重管理を避けて撤去する。
drop trigger if exists trg_spacareer_graduate_on_last_session on public.spacareer_sessions;
drop function if exists public.fn_spacareer_graduate_on_last_session();

-- 応用コースは第1回(2)・第2回(2)のセッション行も作られるが、実際に使うのは
-- oyo_start_session_no 以降の(2)だけで、前2件は永久に未完了のまま残る。
-- それが母数に入っていたため、応用コースの受講生は全コマ完了に到達できず卒業にならなかった。
-- 進捗率も実際より低く出ていた（福原 41.18%→33.33%、小松 17.65%→20.00% へ是正）。
-- あわせて卒業時に contract_ended_at を入れる。担当期間はこの日時で閉じられる。
create or replace function public.fn_spacareer_recalc_progress(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_completed int;
  v_max smallint;
  v_total int;
begin
  select count(*) filter (where s.status = 'completed')::int,
         coalesce(max(s.session_no) filter (where s.status = 'completed' and s.part = 1), 0),
         count(*)::int
    into v_completed, v_max, v_total
  from public.spacareer_sessions s
  join public.spacareer_customers c on c.id = s.customer_id
  where s.customer_id = p_customer_id
    and (coalesce(s.part, 1) = 1
         or (c.course = 'oyo' and s.session_no >= coalesce(c.oyo_start_session_no, 99)));

  update public.spacareer_customers
  set current_session_no = v_max,
      progress_percent = case when v_total > 0
        then round((v_completed::numeric / v_total) * 100, 2) else 0 end,
      status = case
        when v_total > 0 and v_completed >= v_total then 'graduated'
        when v_completed >= 1 then 'in_progress'
        else status
      end,
      contract_ended_at = case
        when v_total > 0 and v_completed >= v_total then coalesce(contract_ended_at, now())
        else contract_ended_at
      end,
      direct_db_access_granted_at = case
        when v_max >= 4 and direct_db_access_granted_at is null then now()
        else direct_db_access_granted_at
      end
  where id = p_customer_id;
end;
$function$;

-- 既存の応用コース2名の進捗を新しい母数で入れ直す（実行済み）
-- select public.fn_spacareer_recalc_progress(id) from public.spacareer_customers where course = 'oyo';
