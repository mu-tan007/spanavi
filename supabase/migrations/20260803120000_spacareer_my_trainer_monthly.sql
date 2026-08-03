-- スパキャリ トレーナー報酬: 本人が自分の分だけ見るための関数（むー様指示 2026-08-03）
--
-- v_spacareer_trainer_monthly は security_invoker なので、非adminのトレーナーが直接引くと
-- 「自分の担当受講生のセッション」も見えてしまい、代打で他トレーナーが実施した回が
-- その他トレーナー名の行として（しかも欠けた回数で）出てしまう。
-- 本人用の導線は必ずこの関数を通し、trainer_id = 自分 の行だけを返す。
create or replace function public.spacareer_my_trainer_monthly()
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
  trainer_name text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $$
  select v.month_key,
         v.session_count,
         v.assigned_customer_count,
         v.session_unit_price,
         v.session_amount,
         v.fixed_allowance,
         v.total_amount,
         v.payment_due_date,
         v.trainer_id,
         v.trainer_name
    from public.v_spacareer_trainer_monthly v
   where v.trainer_id = public.spacareer_current_member_id()
     and v.org_id = public.get_user_org_id()
   order by v.month_key desc;
$$;

comment on function public.spacareer_my_trainer_monthly() is
  'ログイン中のトレーナー本人の月次報酬のみを返す。他人の行は返らない。';

revoke all on function public.spacareer_my_trainer_monthly() from public;
grant execute on function public.spacareer_my_trainer_monthly() to authenticated;
