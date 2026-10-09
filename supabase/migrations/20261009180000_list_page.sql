-- 一覧ページ・詳細モーダルの元データ（2026-10-09 むー様・見本 list.html / detail.html を本番へ）

-- 都道府県ごとの売り手ソーシングのアポ率（エリア順の並びに使う）。件数の少ない県は全体の率に寄せる（架電1,000回分）
create table if not exists public.pref_appo_rates (
  pref text primary key, calls int not null, appos int not null, rate numeric not null, updated_at timestamptz not null default now());
alter table public.pref_appo_rates enable row level security;
drop policy if exists pref_appo_rates_read on public.pref_appo_rates;
create policy pref_appo_rates_read on public.pref_appo_rates for select to authenticated using (true);

create or replace function public.pref_of(addr text) returns text language sql immutable as $$
  select substring(coalesce(addr, '') from '^\s*(東京都|北海道|京都府|大阪府|[^\s都道府県]{2,3}県)')
$$;

create or replace function public.refresh_pref_appo_rates()
returns void language plpgsql security definer set search_path = public as $$
declare v_all numeric;
begin
  create temp table _pc on commit drop as
    select public.pref_of(i.address) pf, count(*)::int calls
      from call_records r join call_list_items i on i.id = r.item_id join call_lists l on l.id = i.list_id
      join engagements e on e.id = l.engagement_id
     where e.slug = 'seller_sourcing' group by 1;
  create temp table _pa on commit drop as
    select public.pref_of(i.address) pf, count(*)::int appos
      from appointments a join call_list_items i on i.id = a.item_id join call_lists l on l.id = i.list_id
      join engagements e on e.id = l.engagement_id
     where e.slug = 'seller_sourcing' and a.status <> 'キャンセル' group by 1;
  select sum(coalesce(a.appos, 0))::numeric / nullif(sum(c.calls), 0) into v_all from _pc c left join _pa a on a.pf = c.pf where c.pf is not null;
  delete from pref_appo_rates where true;
  insert into pref_appo_rates (pref, calls, appos, rate)
  select c.pf, c.calls, coalesce(a.appos, 0), (coalesce(a.appos, 0) + 1000 * coalesce(v_all, 0)) / (c.calls + 1000)
    from _pc c left join _pa a on a.pf = c.pf where c.pf is not null;
end $$;
revoke all on function public.refresh_pref_appo_rates() from public, anon, authenticated;
select public.refresh_pref_appo_rates();
do $$ begin
  perform cron.unschedule('refresh-pref-appo-rates') where exists (select 1 from cron.job where jobname = 'refresh-pref-appo-rates');
  perform cron.schedule('refresh-pref-appo-rates', '20 11 * * *', 'select public.refresh_pref_appo_rates()');
end $$;

-- 1つのリストの、まだかけられる会社（除外・アポ獲得を除く）と、それぞれの履歴（新しい10回）・次の約束・社長の温度感
create or replace function public.list_page_items(p_list_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from call_lists l where l.id = p_list_id and l.org_id = get_user_org_id()) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by x.no), '[]'::jsonb) into v from (
    select i.id, i.no, i.company c,
           coalesce(nullif(i.business, ''), substring(i.memo from '"LBC企業要約": *"([^"]*)"'), '') b,
           i.address a, public.pref_of(i.address) pf, i.revenue rv, i.representative rep, i.representative_kana k,
           i.phone tel, coalesce(nullif(i.call_status, ''), '未架電') st, coalesce(i.industry_group, 'その他') ind,
           h.h, lr.rd, lr.rt, kd.ceo_temp ceo
      from call_list_items i
      left join lateral (
        select jsonb_agg(jsonb_build_object('at', z.called_at, 's', z.status, 'g', z.getter_name) order by z.called_at) h
          from (select r.called_at, r.status, r.getter_name from call_records r where r.item_id = i.id order by r.called_at desc limit 10) z) h on true
      left join lateral (
        select substring(r.memo from '"recall_date":"([0-9-]+)"') rd, substring(r.memo from '"recall_time":"([0-9:]+)"') rt, r.status
          from call_records r where r.item_id = i.id order by r.called_at desc limit 1) lr
        on lr.status = coalesce(nullif(i.call_status, ''), '未架電') and lr.status in ('受付再コール', 'キーマン再コール')
      left join lateral (
        select r.ceo_temp from call_records r where r.item_id = i.id and r.status = 'キーマン断り' order by r.called_at desc limit 1) kd
        on coalesce(nullif(i.call_status, ''), '未架電') = 'キーマン断り'
     where i.list_id = p_list_id and not coalesce(i.is_excluded, false) and coalesce(i.call_status, '') not in ('アポ獲得', '除外')
  ) x;
  return v;
end $$;
revoke all on function public.list_page_items(uuid) from public, anon;
grant execute on function public.list_page_items(uuid) to authenticated;
