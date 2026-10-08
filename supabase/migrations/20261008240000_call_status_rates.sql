-- 直前の結果ごとの「次の1回でアポになる割合」を、商材・業務の区分ごとに、これまでの全部の架電記録から出す（2026-10-08 むー様）
-- 架電リストのページで「あと何件かけたらアポ1件」を出すのに使う。毎日20時（日本時間）に更新。AIは使わない（集計だけ）。
-- 区分：seller_sourcing（M&A売り手）／matching（M&A買い手）／lead_generation_ifa（IFAリード獲得）／
--       client_acquisition（M&Aクライアント開拓）／client_acquisition_ifa（IFAクライアント開拓）／all（すべての架電：それ以外の商材に使う）
-- 本番には apply_migration で適用済み（中身は同じ）
create table if not exists public.call_status_rates (
  segment text not null, prev_status text not null, calls integer not null, appos integer not null, rate numeric not null,
  updated_at timestamptz not null default now(), primary key (segment, prev_status)
);
alter table public.call_status_rates enable row level security;
create policy call_status_rates_read on public.call_status_rates for select to authenticated using (true);

create or replace function public.refresh_call_status_rates()
returns void language plpgsql security definer set search_path = public as $$
begin
  create temp table if not exists _r on commit drop as
  select coalesce(lag(c.status) over (partition by c.item_id order by c.called_at), '未架電') prev, c.status,
         case when e.slug in ('seller_sourcing','matching','lead_generation_ifa','client_acquisition','client_acquisition_ifa') then e.slug else null end seg
  from call_records c left join call_lists l on l.id = c.list_id left join engagements e on e.id = l.engagement_id
  where c.org_id = 'a0000000-0000-0000-0000-000000000001' and c.item_id is not null and c.status is not null;
  delete from call_status_rates;
  insert into call_status_rates (segment, prev_status, calls, appos, rate)
  select seg, prev, count(*), count(*) filter (where status = 'アポ獲得'), round(count(*) filter (where status = 'アポ獲得')::numeric / count(*), 6)
  from _r where seg is not null and prev not in ('アポ獲得', '除外') group by seg, prev
  union all
  select 'all', prev, count(*), count(*) filter (where status = 'アポ獲得'), round(count(*) filter (where status = 'アポ獲得')::numeric / count(*), 6)
  from _r where prev not in ('アポ獲得', '除外') group by prev;
end;
$$;
select public.refresh_call_status_rates();
select cron.unschedule('refresh-call-status-rates') where exists (select 1 from cron.job where jobname = 'refresh-call-status-rates');
select cron.schedule('refresh-call-status-rates', '0 11 * * *', $$ select public.refresh_call_status_rates(); $$);
