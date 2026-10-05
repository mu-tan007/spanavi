-- 全社 > 業績：自社集計に入らない売上を足せるようにする
--   corporate_finance_monthly.sales（segment = sourcing / spacareer）… その事業の売上に足す分
--     営業代行：アポ以外の請求（初期費用など）／スパキャリ：Stripeを通さない銀行振込の受講料
--   segment = 'other' … どの事業にも入らない売上（紹介報酬・人材紹介など）

set lock_timeout = '5s';
alter table public.corporate_finance_monthly drop constraint if exists corporate_finance_monthly_segment_check;
alter table public.corporate_finance_monthly add constraint corporate_finance_monthly_segment_check
  check (segment in ('all', 'sourcing', 'spacareer', 'other'));

drop function if exists public.corporate_finance_metrics(date, date);
create function public.corporate_finance_metrics(p_from date, p_to date)
returns table(
  month date,
  all_sales bigint, all_outsourcing bigint, all_sga bigint, all_operating_profit bigint,
  sourcing_sales bigint, sourcing_outsourcing bigint,
  spacareer_sales bigint, spacareer_outsourcing bigint,
  other_sales bigint
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
    (coalesce(ap.s, 0) + coalesce(fs.sales, 0))::bigint,
    fs.outsourcing,
    (coalesce(st.s, 0) - coalesce(rf.s, 0) + coalesce(fc.sales, 0))::bigint,
    fc.outsourcing,
    fo.sales
  from months mo
  left join fin fa on fa.m = mo.m and fa.segment = 'all'
  left join fin fs on fs.m = mo.m and fs.segment = 'sourcing'
  left join fin fc on fc.m = mo.m and fc.segment = 'spacareer'
  left join fin fo on fo.m = mo.m and fo.segment = 'other'
  left join appo ap on ap.m = mo.m
  left join stripe st on st.m = mo.m
  left join refunds rf on rf.m = mo.m
  order by mo.m;
end;
$function$;

revoke all on function public.corporate_finance_metrics(date, date) from public, anon;
grant execute on function public.corporate_finance_metrics(date, date) to authenticated;
