set local search_path = public, extensions;

-- ============================================================
-- スパキャリ: トレーナー報酬マスタと月次集計
-- ----------------------------------------------------------------
-- むー様確定 2026-07-30:
--   - 1セッション 5,000円（税込）。キックオフ(第0回)は算定対象外、第1回以降のみ
--   - 応用コースの (1)(2) は 2回分（＝セッション行1件を1回として数える）
--   - 同時担当3名以上の月は 固定給 50,000円（税込）をセッション報酬と別枠で加算
--     「3名以上」は月内に1日でも担当していた受講生の実人数で判定
--   - 支払は翌月末
--
--   金額はすべて税込。営業代行の tier 単価（税別運用）とは扱いが異なるので注意。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 報酬マスタ
--    trainer_id IS NULL = 全社デフォルト。個別行を入れるとそちらが優先。
-- ------------------------------------------------------------
create table if not exists public.spacareer_trainer_rates (
  id                             uuid primary key default gen_random_uuid(),
  org_id                         uuid not null references public.organizations(id) on delete cascade,
  trainer_id                     uuid references public.members(id) on delete cascade,
  session_unit_price             integer not null default 5000,
  fixed_allowance                integer not null default 50000,
  fixed_allowance_min_customers  integer not null default 3,
  effective_from                 date not null default '2026-06-01',
  effective_to                   date,
  note                           text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

comment on table public.spacareer_trainer_rates is
  'スパキャリ トレーナー報酬単価。金額はすべて税込。trainer_id IS NULL が全社デフォルト。';
comment on column public.spacareer_trainer_rates.fixed_allowance_min_customers is
  '固定給を付与する最低担当人数。月内に1日でも担当していた受講生の実人数で判定する。';

create unique index if not exists uq_spacareer_trainer_rates_default
  on public.spacareer_trainer_rates (org_id, effective_from)
  where trainer_id is null;
create unique index if not exists uq_spacareer_trainer_rates_trainer
  on public.spacareer_trainer_rates (org_id, trainer_id, effective_from)
  where trainer_id is not null;

-- 全社デフォルトを1本だけ投入
insert into public.spacareer_trainer_rates
  (org_id, trainer_id, session_unit_price, fixed_allowance, fixed_allowance_min_customers, effective_from, note)
select o.id, null, 5000, 50000, 3, '2026-06-01', 'むー様確定 2026-07-30。税込。'
from public.organizations o
where o.id = (select distinct org_id from public.spacareer_customers limit 1)
  and not exists (
    select 1 from public.spacareer_trainer_rates r
    where r.org_id = o.id and r.trainer_id is null
  );

alter table public.spacareer_trainer_rates enable row level security;

drop policy if exists spacareer_trainer_rates_select on public.spacareer_trainer_rates;
create policy spacareer_trainer_rates_select
  on public.spacareer_trainer_rates for select
  using (
    org_id = public.get_user_org_id()
    and (public.spacareer_is_admin()
         or trainer_id is null
         or trainer_id = public.spacareer_current_member_id())
  );

drop policy if exists spacareer_trainer_rates_write on public.spacareer_trainer_rates;
create policy spacareer_trainer_rates_write
  on public.spacareer_trainer_rates for all
  using (org_id = public.get_user_org_id() and public.spacareer_is_admin())
  with check (org_id = public.get_user_org_id() and public.spacareer_is_admin());

-- ------------------------------------------------------------
-- 2. 月次集計ビュー
--    月の区切りは JST。UTC のまま date_trunc すると 9時間ずれて
--    月初・月末のセッションが隣の月に落ちる。
-- ------------------------------------------------------------
drop view if exists public.v_spacareer_trainer_monthly;
create view public.v_spacareer_trainer_monthly
with (security_invoker = true) as
with keys as (
  -- セッションを実施した月
  select s.org_id, s.trainer_id,
         date_trunc('month', s.completed_at at time zone 'Asia/Tokyo')::date as ym
  from public.spacareer_sessions s
  where s.status = 'completed'
    and s.session_no >= 1
    and s.trainer_id is not null
    and s.completed_at is not null
  union
  -- セッション0回でも担当していれば固定給の判定対象になるため、担当期間の各月も含める
  select a.org_id, a.trainer_id, gs::date
  from public.spacareer_trainer_assignments a
  cross join lateral generate_series(
    date_trunc('month', a.started_at at time zone 'Asia/Tokyo'),
    date_trunc('month', coalesce(a.ended_at at time zone 'Asia/Tokyo', now() at time zone 'Asia/Tokyo')),
    interval '1 month'
  ) gs
),
bounds as (
  select k.org_id, k.trainer_id, k.ym,
         (k.ym::timestamp at time zone 'Asia/Tokyo')                        as ym_start,
         ((k.ym + interval '1 month')::timestamp at time zone 'Asia/Tokyo') as ym_end
  from keys k
)
select
  b.org_id,
  b.trainer_id,
  m.name                                    as trainer_name,
  b.ym                                      as month,
  to_char(b.ym, 'YYYY-MM')                  as month_key,
  coalesce(sc.session_count, 0)             as session_count,
  coalesce(cc.customer_count, 0)            as assigned_customer_count,
  rate.session_unit_price,
  coalesce(sc.session_count, 0) * rate.session_unit_price as session_amount,
  case when coalesce(cc.customer_count, 0) >= rate.fixed_allowance_min_customers
       then rate.fixed_allowance else 0 end as fixed_allowance,
  coalesce(sc.session_count, 0) * rate.session_unit_price
    + case when coalesce(cc.customer_count, 0) >= rate.fixed_allowance_min_customers
           then rate.fixed_allowance else 0 end as total_amount,
  -- 翌月末払い
  (b.ym + interval '2 month' - interval '1 day')::date as payment_due_date
from bounds b
join public.members m on m.id = b.trainer_id
cross join lateral (
  -- トレーナー個別行を優先し、無ければ全社デフォルト
  select r.session_unit_price, r.fixed_allowance, r.fixed_allowance_min_customers
  from public.spacareer_trainer_rates r
  where r.org_id = b.org_id
    and (r.trainer_id = b.trainer_id or r.trainer_id is null)
    and r.effective_from <= (b.ym + interval '1 month' - interval '1 day')::date
    and (r.effective_to is null or r.effective_to >= b.ym)
  order by (r.trainer_id is null), r.effective_from desc
  limit 1
) rate
left join lateral (
  select count(*) as session_count
  from public.spacareer_sessions s
  where s.trainer_id = b.trainer_id
    and s.status = 'completed'
    and s.session_no >= 1
    and s.completed_at >= b.ym_start
    and s.completed_at <  b.ym_end
) sc on true
left join lateral (
  -- 月内に1日でも担当していた受講生の実人数
  select count(distinct a.customer_id) as customer_count
  from public.spacareer_trainer_assignments a
  where a.trainer_id = b.trainer_id
    and a.started_at < b.ym_end
    and coalesce(a.ended_at, 'infinity'::timestamptz) > b.ym_start
) cc on true;

comment on view public.v_spacareer_trainer_monthly is
  'トレーナー×月の報酬集計（税込）。月区切りはJST。第0回は算定対象外。応用の(1)(2)は各1回。';

grant select on public.v_spacareer_trainer_monthly to authenticated;

-- ------------------------------------------------------------
-- 3. 帰属未確定のセッション（管理画面での是正用）
-- ------------------------------------------------------------
drop view if exists public.v_spacareer_sessions_unattributed;
create view public.v_spacareer_sessions_unattributed
with (security_invoker = true) as
select s.id as session_id, s.org_id, s.customer_id,
       coalesce(mem.name, c.nickname) as customer_name,
       c.course, s.session_no, s.part, s.completed_at,
       c.assigned_trainer_id as current_trainer_id,
       t.name as current_trainer_name
from public.spacareer_sessions s
join public.spacareer_customers c on c.id = s.customer_id
left join public.members mem on mem.id = c.member_id
left join public.members t on t.id = c.assigned_trainer_id
where s.status = 'completed'
  and s.session_no >= 1
  and s.trainer_id is null;

comment on view public.v_spacareer_sessions_unattributed is
  '実施トレーナーが未確定の完了セッション（算定対象のみ）。担当変更履歴が無い過去分の是正に使う。';

grant select on public.v_spacareer_sessions_unattributed to authenticated;
