-- 全社 > 業績（管理者のみ）
--   月ごとの「新規顧客数」「支援した会社数」「取得アポ数」「売上」を返す。
--   ・新規顧客 … 契約締結日と初回架電日の早いほうが、その月に入る顧客
--   ・支援した会社 … その月に1件以上架電した顧客（クライアント開拓リストは除く）
--   ・取得アポ … アポの登録日（JST）がその月のもの（開拓リスト由来は除く）
--   ・売上 … 面談日がその月・アポ取得/事前確認済/面談済・開拓リスト由来は除く（money.js の salesAmountOf と同じ決まり）

set lock_timeout = '5s';
alter table public.clients add column if not exists contract_signed_on date;
comment on column public.clients.contract_signed_on is '契約締結日。全社 > 業績の新規顧客の月判定に使う';

create or replace function public.corporate_business_metrics(p_from date, p_to date)
returns table(month date, new_clients integer, active_clients integer, appo_count integer, sales bigint)
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
  with lists as (
    select l.id, l.client_id, coalesce(l.is_prospecting, false) as prosp
      from public.call_lists l
     where l.org_id = v_org_id
  ),
  call_m as (
    select distinct l.client_id, date_trunc('month', cr.called_at at time zone 'Asia/Tokyo')::date as m
      from public.call_records cr
      join lists l on l.id = cr.list_id
     where cr.org_id = v_org_id
       and l.client_id is not null
       and not l.prosp
  ),
  first_call as (
    select client_id, min(m) as m from call_m group by client_id
  ),
  starts as (
    select date_trunc('month', least(c.contract_signed_on, fc.m))::date as m
      from public.clients c
      left join first_call fc on fc.client_id = c.id
     where c.org_id = v_org_id
       and (c.contract_signed_on is not null or fc.m is not null)
  ),
  ap as (
    select a.created_at, a.meeting_date, a.status, a.sales_amount
      from public.appointments a
      left join lists l on l.id = a.list_id
     where a.org_id = v_org_id
       and not coalesce(l.prosp, false)
  ),
  months as (
    select generate_series(v_from, v_to, interval '1 month')::date as m
  )
  select
    mo.m,
    (select count(*) from starts s where s.m = mo.m)::integer,
    (select count(*) from call_m c where c.m = mo.m)::integer,
    (select count(*) from ap where date_trunc('month', ap.created_at at time zone 'Asia/Tokyo')::date = mo.m)::integer,
    (select coalesce(sum(ap.sales_amount), 0) from ap
      where ap.meeting_date is not null
        and date_trunc('month', ap.meeting_date)::date = mo.m
        and ap.status in ('アポ取得', '事前確認済', '面談済'))::bigint
  from months mo
  order by mo.m;
end;
$function$;

revoke all on function public.corporate_business_metrics(date, date) from public, anon;
grant execute on function public.corporate_business_metrics(date, date) to authenticated;
