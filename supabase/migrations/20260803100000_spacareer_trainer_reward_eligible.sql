-- スパキャリ トレーナー報酬: 報酬対象外トレーナーの除外
-- むー様指示 2026-08-03: 小山（スパキャリ事業責任者）はトレーナー報酬の支払対象ではないため
-- 「トレーナー報酬」タブに出さない。
--
-- 名前をビューに直書きすると次に対象者が変わったときにマイグレーションが要るので、
-- 報酬条件のマスタ `spacareer_trainer_rates` に「対象/対象外」フラグを持たせてデータで切る。
-- セッション実績そのもの（セッション記録タブ）は従来どおり小山の分も残る。

alter table public.spacareer_trainer_rates
  add column if not exists reward_eligible boolean not null default true;

comment on column public.spacareer_trainer_rates.reward_eligible is
  '報酬支払の対象か。false のトレーナーは v_spacareer_trainer_monthly に出ない（実績集計には影響しない）';

-- 小山 在人: 事業責任者のため報酬対象外
insert into public.spacareer_trainer_rates
  (org_id, trainer_id, session_unit_price, fixed_allowance, fixed_allowance_min_customers,
   effective_from, effective_to, reward_eligible, note)
select 'a0000000-0000-0000-0000-000000000001'::uuid,
       '4fe8a86f-e059-4b1c-b6a3-f008a13cc2f4'::uuid,
       0, 0, 3, '2026-06-01'::date, null, false,
       'スパキャリ事業責任者のため報酬対象外（むー様指示 2026-08-03）'
where not exists (
  select 1 from public.spacareer_trainer_rates
  where trainer_id = '4fe8a86f-e059-4b1c-b6a3-f008a13cc2f4'::uuid
);

-- ビューは列構成を変えず WHERE を1つ足すだけ（CREATE OR REPLACE で権限は維持される）
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
         ((k.ym + '1 mon'::interval) at time zone 'Asia/Tokyo') as ym_end
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
       and a.started_at < b.ym_end
       and coalesce(a.ended_at, 'infinity'::timestamptz) > b.ym_start) cc on true
 where rate.reward_eligible;
