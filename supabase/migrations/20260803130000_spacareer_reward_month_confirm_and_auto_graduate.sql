-- スパキャリ トレーナー報酬 むー様指示 2026-08-03
--   1. 月次確定（スナップショット）。確定した月は以後金額が動かない
--   2. 最後のコマを完了したら自動で卒業にする
--
-- 営業代行の payroll_snapshots と同じ考え方。確定解除は用意せず、直したいときは
-- 再計算で確定値を作り直す（[[feedback_payroll_confirmed_snapshot_is_truth]] の運用に揃える）。

-- ------------------------------------------------------------
-- 1-a. 確定値の保存先
-- ------------------------------------------------------------
create table if not exists public.spacareer_trainer_reward_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  pay_month text not null,                    -- 'YYYY-MM'
  member_id uuid not null references public.members(id),
  trainer_name text,
  session_count bigint not null default 0,
  assigned_customer_count bigint not null default 0,
  session_unit_price integer not null default 0,
  session_amount bigint not null default 0,
  fixed_allowance integer not null default 0,
  total_amount bigint not null default 0,
  payment_due_date date,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.members(id),
  recalculated_at timestamptz,
  unique (org_id, pay_month, member_id)
);

comment on table public.spacareer_trainer_reward_snapshots is
  'スパキャリ トレーナー報酬の月次確定値。確定した月はこの値が正で、以後の帰属訂正では動かない。';

alter table public.spacareer_trainer_reward_snapshots enable row level security;

drop policy if exists spacareer_trainer_reward_snapshots_select on public.spacareer_trainer_reward_snapshots;
create policy spacareer_trainer_reward_snapshots_select
on public.spacareer_trainer_reward_snapshots for select
using (org_id = public.get_user_org_id()
       and (public.spacareer_is_admin() or member_id = public.spacareer_current_member_id()));

-- 書き込みは確定・再計算の関数（SECURITY DEFINER）経由のみ。直接の更新は運営だけに許す。
drop policy if exists spacareer_trainer_reward_snapshots_write on public.spacareer_trainer_reward_snapshots;
create policy spacareer_trainer_reward_snapshots_write
on public.spacareer_trainer_reward_snapshots for all
using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ------------------------------------------------------------
-- 1-b. 表示用ビュー: 確定済みの月は確定値、未確定の月は都度計算
-- ------------------------------------------------------------
create or replace view public.v_spacareer_trainer_monthly_display
with (security_invoker = true) as
with confirmed_months as (
  select distinct org_id, pay_month from public.spacareer_trainer_reward_snapshots
)
select s.org_id,
       s.member_id as trainer_id,
       s.trainer_name,
       s.pay_month as month_key,
       s.session_count,
       s.assigned_customer_count,
       s.session_unit_price,
       s.session_amount,
       s.fixed_allowance,
       s.total_amount,
       s.payment_due_date,
       true as is_confirmed,
       s.confirmed_at
  from public.spacareer_trainer_reward_snapshots s
union all
select v.org_id,
       v.trainer_id,
       v.trainer_name,
       v.month_key,
       v.session_count,
       v.assigned_customer_count,
       v.session_unit_price,
       v.session_amount,
       v.fixed_allowance,
       v.total_amount,
       v.payment_due_date,
       false as is_confirmed,
       null::timestamptz as confirmed_at
  from public.v_spacareer_trainer_monthly v
 where not exists (
   select 1 from confirmed_months c
    where c.org_id = v.org_id and c.pay_month = v.month_key);

comment on view public.v_spacareer_trainer_monthly_display is
  'トレーナー月次報酬の表示用。確定済みの月はスナップショット、未確定の月は都度計算を返す。';

-- ------------------------------------------------------------
-- 1-c. 確定・再計算
-- ------------------------------------------------------------
create or replace function public.spacareer_confirm_trainer_reward_month(p_month text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_n integer;
begin
  if not public.spacareer_is_admin() then
    raise exception '報酬を確定できるのは運営のみです';
  end if;

  insert into public.spacareer_trainer_reward_snapshots
    (org_id, pay_month, member_id, trainer_name, session_count, assigned_customer_count,
     session_unit_price, session_amount, fixed_allowance, total_amount, payment_due_date,
     confirmed_at, confirmed_by)
  select v.org_id, v.month_key, v.trainer_id, v.trainer_name, v.session_count,
         v.assigned_customer_count, v.session_unit_price, v.session_amount,
         v.fixed_allowance, v.total_amount, v.payment_due_date,
         now(), public.spacareer_current_member_id()
    from public.v_spacareer_trainer_monthly v
   where v.month_key = p_month
     and v.org_id = public.get_user_org_id()
  on conflict (org_id, pay_month, member_id) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.spacareer_confirm_trainer_reward_month(text) is
  '指定月のトレーナー報酬を確定する（運営のみ）。既に確定済みの行は触らない。';

create or replace function public.spacareer_recalculate_trainer_reward_month(p_month text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_n integer;
begin
  if not public.spacareer_is_admin() then
    raise exception '報酬を再計算できるのは運営のみです';
  end if;

  insert into public.spacareer_trainer_reward_snapshots
    (org_id, pay_month, member_id, trainer_name, session_count, assigned_customer_count,
     session_unit_price, session_amount, fixed_allowance, total_amount, payment_due_date,
     confirmed_at, confirmed_by, recalculated_at)
  select v.org_id, v.month_key, v.trainer_id, v.trainer_name, v.session_count,
         v.assigned_customer_count, v.session_unit_price, v.session_amount,
         v.fixed_allowance, v.total_amount, v.payment_due_date,
         now(), public.spacareer_current_member_id(), now()
    from public.v_spacareer_trainer_monthly v
   where v.month_key = p_month
     and v.org_id = public.get_user_org_id()
  on conflict (org_id, pay_month, member_id) do update
    set trainer_name = excluded.trainer_name,
        session_count = excluded.session_count,
        assigned_customer_count = excluded.assigned_customer_count,
        session_unit_price = excluded.session_unit_price,
        session_amount = excluded.session_amount,
        fixed_allowance = excluded.fixed_allowance,
        total_amount = excluded.total_amount,
        payment_due_date = excluded.payment_due_date,
        recalculated_at = now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.spacareer_recalculate_trainer_reward_month(text) is
  '確定済み月の金額を現在のデータで作り直す（運営のみ）。確定解除の代わりに使う。';

revoke all on function public.spacareer_confirm_trainer_reward_month(text) from public;
revoke all on function public.spacareer_recalculate_trainer_reward_month(text) from public;
grant execute on function public.spacareer_confirm_trainer_reward_month(text) to authenticated;
grant execute on function public.spacareer_recalculate_trainer_reward_month(text) to authenticated;

-- ------------------------------------------------------------
-- 1-d. 本人用の関数も確定値を返すようにする
-- ------------------------------------------------------------
drop function if exists public.spacareer_my_trainer_monthly();
create function public.spacareer_my_trainer_monthly()
returns table (
  month_key text,
  session_count bigint,
  assigned_customer_count bigint,
  session_unit_price integer,
  session_amount bigint,
  fixed_allowance integer,
  total_amount bigint,
  payment_due_date date,
  trainer_id uuid,
  trainer_name text,
  is_confirmed boolean,
  confirmed_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  select v.month_key, v.session_count, v.assigned_customer_count, v.session_unit_price,
         v.session_amount, v.fixed_allowance, v.total_amount, v.payment_due_date,
         v.trainer_id, v.trainer_name, v.is_confirmed, v.confirmed_at
    from public.v_spacareer_trainer_monthly_display v
   where v.trainer_id = public.spacareer_current_member_id()
     and v.org_id = public.get_user_org_id()
   order by v.month_key desc;
$$;

comment on function public.spacareer_my_trainer_monthly() is
  'ログイン中のトレーナー本人の月次報酬のみを返す。他人の行は返らない。';

revoke all on function public.spacareer_my_trainer_monthly() from public;
grant execute on function public.spacareer_my_trainer_monthly() to authenticated;

-- ------------------------------------------------------------
-- 2. 最後のコマ完了で自動卒業
-- ------------------------------------------------------------
-- 強化コースは第8回、応用コースは第8回(2)がその受講生の最後のコマ。
-- コース別に条件を書き分けず「その受講生のセッションのうち (回, パート) が最大のもの」で判定する。
create or replace function public.fn_spacareer_graduate_on_last_session()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_last_no smallint;
  v_last_part integer;
begin
  select s.session_no, coalesce(s.part, 1)
    into v_last_no, v_last_part
    from public.spacareer_sessions s
   where s.customer_id = new.customer_id
   order by s.session_no desc, coalesce(s.part, 1) desc
   limit 1;

  if v_last_no = new.session_no and v_last_part = coalesce(new.part, 1) then
    -- 卒業にすると担当期間を閉じるトリガーが続けて走る（固定給の人数から外れる）
    update public.spacareer_customers
       set status = 'graduated',
           contract_ended_at = coalesce(contract_ended_at, new.completed_at, now())
     where id = new.customer_id
       and status = 'in_progress';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_spacareer_graduate_on_last_session on public.spacareer_sessions;
create trigger trg_spacareer_graduate_on_last_session
after update of status on public.spacareer_sessions
for each row
when (new.status = 'completed' and old.status is distinct from 'completed')
execute function public.fn_spacareer_graduate_on_last_session();
