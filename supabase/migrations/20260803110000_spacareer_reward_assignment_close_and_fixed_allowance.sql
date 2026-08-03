-- スパキャリ トレーナー報酬 むー様指示 2026-08-03
--   1. 卒業・解約したら担当期間（アサイン履歴）を閉じる
--   2. 固定給5万の判定を「月末時点で3名以上」に変更する
--      （当月＝進行中の月は現時点で判定。月の途中で減ったら付かない／増えたら付く）

-- ------------------------------------------------------------
-- 1. 卒業・解約で担当期間を閉じる
-- ------------------------------------------------------------
-- これまで ended_at を書いていたのは「担当トレーナーが差し替わったとき」だけだった。
-- 受講生が卒業・解約しても担当が開きっぱなしになり、実施ゼロでも固定給の人数に
-- 数え続けられてしまうため、ステータス変更でも閉じるようにする。
-- assigned_trainer_id 自体は消さない（誰が担当していたかは画面に残す）。
create or replace function public.fn_spacareer_track_trainer_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_at timestamptz;
  v_trainer_changed boolean;
begin
  v_trainer_changed := tg_op <> 'UPDATE'
    or new.assigned_trainer_id is distinct from old.assigned_trainer_id;

  -- 担当もステータスも動いていなければ何もしない
  if tg_op = 'UPDATE'
     and not v_trainer_changed
     and new.status is not distinct from old.status then
    return new;
  end if;

  -- 卒業・解約: 開いている担当期間をすべて閉じて終了
  if new.status in ('graduated', 'cancelled') then
    update public.spacareer_trainer_assignments
       set ended_at = greatest(coalesce(new.contract_ended_at, now()), started_at)
     where customer_id = new.id
       and ended_at is null;
    return new;
  end if;

  -- 受講中に戻った場合は「戻した時点」から数え直す。assigned_at は最初の
  -- アサイン日のままなので、それを起点にすると過去月の人数まで動いてしまう。
  v_at := case when v_trainer_changed then coalesce(new.assigned_at, now()) else now() end;

  update public.spacareer_trainer_assignments
     set ended_at = greatest(v_at, started_at)
   where customer_id = new.id
     and ended_at is null
     and trainer_id is distinct from new.assigned_trainer_id;

  if new.assigned_trainer_id is not null then
    insert into public.spacareer_trainer_assignments
      (org_id, customer_id, trainer_id, started_at, assigned_by)
    select new.org_id, new.id, new.assigned_trainer_id, v_at, public.spacareer_current_member_id()
    where not exists (
      select 1 from public.spacareer_trainer_assignments
      where customer_id = new.id and ended_at is null
        and trainer_id = new.assigned_trainer_id
    );
  end if;

  return new;
end;
$function$;

-- ステータス変更でも発火させる
drop trigger if exists trg_spacareer_track_trainer_assignment on public.spacareer_customers;
create trigger trg_spacareer_track_trainer_assignment
after insert or update of assigned_trainer_id, status on public.spacareer_customers
for each row execute function public.fn_spacareer_track_trainer_assignment();

-- ------------------------------------------------------------
-- 2. 固定給5万の判定を「月末時点の担当人数」に変更
-- ------------------------------------------------------------
-- 旧: その月に1日でも担当期間が重なった受講生を数える（3人→2人でも3人と数えた）
-- 新: 月末時点で担当している受講生を数える。進行中の月は現時点で判定する。
create or replace view public.v_spacareer_trainer_monthly
with (security_invoker = true) as
with keys as (
  select s.org_id,
         s.trainer_id,
         (date_trunc('month', (s.completed_at at time zone 'Asia/Tokyo')))::date as ym
    from spacareer_sessions s
   where s.status = 'completed'
     and s.session_no >= 1
     and s.trainer_id is not null
     and s.completed_at is not null
  union
  select a.org_id,
         a.trainer_id,
         gs.gs::date as gs
    from spacareer_trainer_assignments a
    cross join lateral generate_series(
      date_trunc('month', (a.started_at at time zone 'Asia/Tokyo')),
      date_trunc('month', coalesce((a.ended_at at time zone 'Asia/Tokyo'), (now() at time zone 'Asia/Tokyo'))),
      '1 mon'::interval) gs(gs)
), bounds as (
  select k.org_id,
         k.trainer_id,
         k.ym,
         (k.ym::timestamp without time zone at time zone 'Asia/Tokyo') as ym_start,
         ((k.ym + '1 mon'::interval) at time zone 'Asia/Tokyo') as ym_end,
         -- 判定時点: その月の末尾。ただし進行中の月は現時点で見る。
         least(((k.ym + '1 mon'::interval) at time zone 'Asia/Tokyo') - '1 microsecond'::interval,
               now()) as as_of
    from keys k
)
select b.org_id,
       b.trainer_id,
       m.name as trainer_name,
       b.ym as month,
       to_char(b.ym::timestamp with time zone, 'YYYY-MM') as month_key,
       coalesce(sc.session_count, 0::bigint) as session_count,
       coalesce(cc.customer_count, 0::bigint) as assigned_customer_count,
       rate.session_unit_price,
       coalesce(sc.session_count, 0::bigint) * rate.session_unit_price as session_amount,
       case when coalesce(cc.customer_count, 0::bigint) >= rate.fixed_allowance_min_customers
            then rate.fixed_allowance else 0 end as fixed_allowance,
       coalesce(sc.session_count, 0::bigint) * rate.session_unit_price
         + case when coalesce(cc.customer_count, 0::bigint) >= rate.fixed_allowance_min_customers
                then rate.fixed_allowance else 0 end as total_amount,
       (b.ym + '2 mons'::interval - '1 day'::interval)::date as payment_due_date
  from bounds b
  join members m on m.id = b.trainer_id
  cross join lateral (
    select r.session_unit_price,
           r.fixed_allowance,
           r.fixed_allowance_min_customers,
           r.reward_eligible
      from spacareer_trainer_rates r
     where r.org_id = b.org_id
       and (r.trainer_id = b.trainer_id or r.trainer_id is null)
       and r.effective_from <= (b.ym + '1 mon'::interval - '1 day'::interval)::date
       and (r.effective_to is null or r.effective_to >= b.ym)
     order by (r.trainer_id is null), r.effective_from desc
     limit 1) rate
  left join lateral (
    select count(*) as session_count
      from spacareer_sessions s
     where s.trainer_id = b.trainer_id
       and s.status = 'completed'
       and s.session_no >= 1
       and s.completed_at >= b.ym_start
       and s.completed_at < b.ym_end) sc on true
  left join lateral (
    select count(distinct a.customer_id) as customer_count
      from spacareer_trainer_assignments a
     where a.trainer_id = b.trainer_id
       and a.started_at <= b.as_of
       and coalesce(a.ended_at, 'infinity'::timestamptz) > b.as_of) cc on true
 where rate.reward_eligible;

comment on view public.v_spacareer_trainer_monthly is
  'スパキャリ トレーナー月次報酬。回数は完了時に焼き付けた実施トレーナー基準。固定給は月末時点（進行中の月は現時点）の担当人数で判定。金額は税込。';
