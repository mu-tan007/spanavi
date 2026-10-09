-- 架電リストの「条件で探す」6欄（2026-10-09 むー様・見本 calllist.html を本番へ）
-- 動いているリスト・除外していない会社だけ。呼んだ人の組織のものだけ返す
--  1 受付再コール：かけ直す日が今日か過ぎている（今日→時刻順、そのあと期限切れの新しい順）
--  2 キーマン再コール：同上
--  3 キーマン断り：最新の断りで社長の温度感が高・中
--  4 再アプローチ：同じ会社が別のクライアントでアポ（キャンセル以外）
--  5 再アプローチ：リスケのまま30日超（release_reapproach_items で戻した会社）
--  6 再アプローチ：先方都合のキャンセルから30日超（同上）
create or replace function public.call_find_sections(p_limit int default 200)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := get_user_org_id(); v_today text := to_char(now() at time zone 'Asia/Tokyo','YYYY-MM-DD'); v jsonb;
begin
  -- 途中の結果は一度だけ作る（CTE を何度も使うと計算を繰り返して遅くなるため）
  drop table if exists _fs_it, _fs_rc, _fs_kd, _fs_ap, _fs_oa, _fs_ra;
  create temp table _fs_it on commit drop as
    select i.id, i.list_id, i.no, i.company, i.phone, i.corporate_number, coalesce(i.call_status,'未架電') st,
           l.name lname, cl.name cname, cl.id client_id, i.reapproach_appo_id, i.reapproach_note
      from call_list_items i join call_lists l on l.id = i.list_id left join clients cl on cl.id = l.client_id
     where i.org_id = v_org and not coalesce(l.is_archived, false) and not coalesce(i.is_excluded, false);
  create index on _fs_it(id);
  create temp table _fs_rc on commit drop as
    select it.*, lr.rd, lr.rt, lr.g, lr.assignee
      from _fs_it it join lateral (
        select substring(r.memo from '"recall_date":"([0-9-]+)"') rd, substring(r.memo from '"recall_time":"([0-9:]+)"') rt,
               r.getter_name g, substring(r.memo from '"assignee":"([^"]*)"') assignee, r.status
          from call_records r where r.item_id = it.id order by r.called_at desc limit 1) lr on lr.status = it.st
     where it.st in ('受付再コール','キーマン再コール') and lr.rd is not null and lr.rd <= v_today;
  create temp table _fs_kd on commit drop as
    select it.*, lr.ceo_temp, lr.q, lr.rs, lr.called_at, lr.g
      from _fs_it it join lateral (
        select r.ceo_temp, r.ceo_temp_quote q, r.ceo_temp_reasons rs, r.called_at, r.getter_name g
          from call_records r where r.item_id = it.id and r.status = 'キーマン断り' order by r.called_at desc limit 1) lr on true
     where it.st = 'キーマン断り' and lr.ceo_temp in ('高','中');
  create temp table _fs_ap on commit drop as
    select a.item_id, a.client_id, a.status, a.created_at, cl.name cname,
           (select public.company_key(i.corporate_number, i.phone) from call_list_items i where i.id = a.item_id) ck
      from appointments a left join clients cl on cl.id = a.client_id
     where a.org_id = v_org and a.status <> 'キャンセル' and a.created_at > now() - interval '180 days';
  create temp table _fs_oa on commit drop as
    select distinct on (it.id) it.*, ap.created_at apd, ap.cname apc, ap.status aps
      from _fs_ap ap join call_list_items j on public.company_key(j.corporate_number, j.phone) = ap.ck
      join _fs_it it on it.id = j.id and ap.client_id is distinct from it.client_id
     where ap.ck is not null and it.st <> 'アポ獲得' order by it.id, ap.created_at desc;
  create temp table _fs_ra on commit drop as
    select it.*, a.status aps, a.created_at apd, a.meeting_date md, a.getter_name apg, a.cancel_reason cr
      from _fs_it it join appointments a on a.id = it.reapproach_appo_id where it.st = '再アプローチ';
  select jsonb_build_object(
    'n', jsonb_build_object(
      '1', (select count(*) from _fs_rc where st='受付再コール'), '2', (select count(*) from _fs_rc where st='キーマン再コール'),
      '3', (select count(*) from _fs_kd), '4', (select count(*) from _fs_oa),
      '5', (select count(*) from _fs_ra where aps='リスケ中'), '6', (select count(*) from _fs_ra where aps='キャンセル')),
    'today', jsonb_build_object(
      '1', (select count(*) from _fs_rc where st='受付再コール' and rd = v_today),
      '2', (select count(*) from _fs_rc where st='キーマン再コール' and rd = v_today)),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', r, 'lv', lv, 'n', n) order by lv, n desc), '[]'::jsonb) from (
        select r, ctr.level lv, count(*) n from _fs_kd kd, unnest(kd.rs) r join ceo_temp_reasons ctr on ctr.label = r and ctr.level in ('高','中') group by r, ctr.level) z),
    's1', (select coalesce(jsonb_agg(to_jsonb(t) - 'corporate_number'), '[]') from (select * from _fs_rc where st='受付再コール'
            order by (rd = v_today) desc, case when rd = v_today then coalesce(rt,'99') end, rd desc limit p_limit) t),
    's2', (select coalesce(jsonb_agg(to_jsonb(t) - 'corporate_number'), '[]') from (select * from _fs_rc where st='キーマン再コール'
            order by (rd = v_today) desc, case when rd = v_today then coalesce(rt,'99') end, rd desc limit p_limit) t),
    's3', (select coalesce(jsonb_agg(to_jsonb(t) - 'corporate_number'), '[]') from (select * from _fs_kd order by (ceo_temp='高') desc, called_at desc limit p_limit) t),
    's4', (select coalesce(jsonb_agg(to_jsonb(t) - 'corporate_number'), '[]') from (select * from _fs_oa order by apd desc limit p_limit) t),
    's5', (select coalesce(jsonb_agg(to_jsonb(t) - 'corporate_number'), '[]') from (select * from _fs_ra where aps='リスケ中' order by apd desc limit p_limit) t),
    's6', (select coalesce(jsonb_agg(to_jsonb(t) - 'corporate_number'), '[]') from (select * from _fs_ra where aps='キャンセル' order by apd desc limit p_limit) t)
  ) into v;
  return v;
end $$;
revoke all on function public.call_find_sections(int) from public, anon;
grant execute on function public.call_find_sections(int) to authenticated;

-- リストの周回：まだかけられる会社の9割以上に何回かけ終えたか＋次の周の進み（毎日20時に出し直す）
create table if not exists public.list_laps (
  list_id uuid primary key references public.call_lists(id) on delete cascade,
  org_id uuid not null, lap int not null, next_pct int not null, updated_at timestamptz not null default now());
alter table public.list_laps enable row level security;
drop policy if exists list_laps_read on public.list_laps;
create policy list_laps_read on public.list_laps for select to authenticated using (org_id = get_user_org_id());
create or replace function public.refresh_list_laps()
returns void language plpgsql security definer set search_path = public as $$
begin
  create temp table if not exists _n on commit drop as
    select i.list_id, i.org_id, i.id, count(r.id) n
      from call_list_items i join call_lists l on l.id = i.list_id left join call_records r on r.item_id = i.id
     where not coalesce(l.is_archived,false) and not coalesce(i.is_excluded,false) and coalesce(i.call_status,'') not in ('アポ獲得','除外')
     group by 1,2,3;
  delete from list_laps where true;
  insert into list_laps (list_id, org_id, lap, next_pct)
  select list_id, org_id,
         coalesce((select max(k) from generate_series(1,30) k where (select avg((n2.n >= k)::int) from _n n2 where n2.list_id = g.list_id) >= 0.9), 0),
         0
    from (select distinct list_id, org_id from _n) g;
  update list_laps ll set next_pct = round(100 * (select avg((n.n >= ll.lap + 1)::int) from _n n where n.list_id = ll.list_id)), updated_at = now();
end $$;
revoke all on function public.refresh_list_laps() from public, anon, authenticated;
select public.refresh_list_laps();
do $$ begin
  perform cron.unschedule('refresh-list-laps') where exists (select 1 from cron.job where jobname = 'refresh-list-laps');
  perform cron.schedule('refresh-list-laps', '10 11 * * *', 'select public.refresh_list_laps()');
end $$;
