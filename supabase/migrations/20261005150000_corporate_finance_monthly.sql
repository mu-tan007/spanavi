-- 全社 > 業績：会計の数字（管理者のみ）
--   corporate_finance_monthly … 月×区分ごとの会計の数字を手で入れる表
--     segment = 'all'（税理士の試算表＝会社全体）／'sourcing'（営業代行）／'spacareer'（スパキャリ）
--     all は試算表の損益（税込）。sourcing / spacareer は外注費だけ入れる（税理士共有フォルダ 02 / 03 の請求書の合計）。
--   corporate_finance_metrics(p_from, p_to) … 月ごとに会計の数字と、事業別の売上（自社集計）を返す
--     営業代行の売上 … 面談日の月・アポ取得/事前確認済/面談済・開拓リスト除く（請求書の「何月分」と同じ）
--     スパキャリの売上 … Stripe の入金日の月（対象外を除く）から返金を引いたもの

create table if not exists public.corporate_finance_monthly (
  org_id uuid not null,
  month date not null,
  segment text not null check (segment in ('all', 'sourcing', 'spacareer')),
  sales bigint,
  outsourcing bigint,
  sga bigint,
  operating_profit bigint,
  ordinary_profit bigint,
  items jsonb,
  source text,
  updated_at timestamptz not null default now(),
  primary key (org_id, month, segment)
);
comment on table public.corporate_finance_monthly is '全社 > 業績の会計の数字。all=税理士の試算表、sourcing/spacareer=事業別の外注費';

alter table public.corporate_finance_monthly enable row level security;
drop policy if exists corporate_finance_monthly_admin on public.corporate_finance_monthly;
create policy corporate_finance_monthly_admin on public.corporate_finance_monthly
  for all to authenticated
  using (public.is_org_admin() and org_id = public.get_user_org_id())
  with check (public.is_org_admin() and org_id = public.get_user_org_id());

create or replace function public.corporate_finance_metrics(p_from date, p_to date)
returns table(
  month date,
  all_sales bigint, all_outsourcing bigint, all_sga bigint, all_operating_profit bigint,
  sourcing_sales bigint, sourcing_outsourcing bigint,
  spacareer_sales bigint, spacareer_outsourcing bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_org_id uuid := public.get_user_org_id();
  v_from date := date_trunc('month', p_from)::date;
  v_to   date := date_trunc('month', p_to)::date;
begin
  if not public.is_org_admin() then
    raise exception 'forbidden';
  end if;

  return query
  with months as (
    select generate_series(v_from, v_to, interval '1 month')::date as m
  ),
  fin as (
    select f.month as m, f.segment, f.sales, f.outsourcing, f.sga, f.operating_profit
      from public.corporate_finance_monthly f
     where f.org_id = v_org_id
  ),
  appo as (
    select date_trunc('month', a.meeting_date)::date as m, sum(a.sales_amount) as s
      from public.appointments a
      left join public.call_lists l on l.id = a.list_id
     where a.org_id = v_org_id
       and a.meeting_date is not null
       and a.status in ('アポ取得', '事前確認済', '面談済')
       and not coalesce(l.is_prospecting, false)
     group by 1
  ),
  stripe as (
    select date_trunc('month', i.paid_at at time zone 'Asia/Tokyo')::date as m, sum(i.amount_paid) as s
      from public.spacareer_invoices i
     where i.org_id = v_org_id
       and i.paid_at is not null
       and not coalesce(i.excluded, false)
     group by 1
  ),
  refunds as (
    select date_trunc('month', r.created at time zone 'Asia/Tokyo')::date as m, sum(r.amount) as s
      from public.spacareer_refunds r
     where r.org_id = v_org_id
     group by 1
  )
  select
    mo.m,
    fa.sales, fa.outsourcing, fa.sga, fa.operating_profit,
    coalesce(ap.s, 0)::bigint,
    fs.outsourcing,
    (coalesce(st.s, 0) - coalesce(rf.s, 0))::bigint,
    fc.outsourcing
  from months mo
  left join fin fa on fa.m = mo.m and fa.segment = 'all'
  left join fin fs on fs.m = mo.m and fs.segment = 'sourcing'
  left join fin fc on fc.m = mo.m and fc.segment = 'spacareer'
  left join appo ap on ap.m = mo.m
  left join stripe st on st.m = mo.m
  left join refunds rf on rf.m = mo.m
  order by mo.m;
end;
$function$;

revoke all on function public.corporate_finance_metrics(date, date) from public, anon;
grant execute on function public.corporate_finance_metrics(date, date) to authenticated;
