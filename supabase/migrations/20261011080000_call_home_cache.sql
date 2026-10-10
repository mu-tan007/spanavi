-- 架電リストを速く開く（2026-10-11 むー様）
-- リストの数字（call_list_home）と「条件で探す」（call_find_sections）は、開くたびに約23万行を数え直していて1.4〜11秒かかっていた。
-- 数えた結果を call_home_cache に入れて2分ごとに裏で更新し、ページはそれを読むだけにする。
-- 表が空か10分より古いときだけ、今までどおりその場で数える（*_live）。

create table if not exists public.call_home_cache (
  org_id uuid not null,
  kind text not null,              -- home ／ find200 ／ find5000
  data jsonb not null,
  refreshed_at timestamptz not null default now(),
  primary key (org_id, kind)
);
alter table public.call_home_cache enable row level security;  -- 直接は読ませない（下の関数だけが読む）

CREATE OR REPLACE FUNCTION public.call_list_home_live(p_org uuid)
 RETURNS TABLE(list_id uuid, total integer, excluded integer, appo_done integer, callable integer, expected numeric, statuses jsonb, appo30 integer, last_called timestamp with time zone, lap integer, next_pct integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  with l as (

    select l.id, l.created_at, case when e.slug in ('seller_sourcing','matching','lead_generation_ifa','client_acquisition','client_acquisition_ifa') then e.slug else 'all' end seg

      from call_lists l left join engagements e on e.id = l.engagement_id

     where l.org_id = p_org and not coalesce(l.is_archived, false)

  ), it as (

    select i.list_id, coalesce(i.is_excluded, false) ex, coalesce(nullif(i.call_status, ''), '未架電') st, l.seg

      from call_list_items i join l on l.id = i.list_id

  ), agg as (

    select it.list_id, count(*)::int total, count(*) filter (where ex)::int excluded,

           count(*) filter (where not ex and st = 'アポ獲得')::int appo_done,

           count(*) filter (where not ex and st not in ('アポ獲得','除外'))::int callable,

           coalesce(sum(coalesce(s.rate, a.rate, 0)) filter (where not ex and st not in ('アポ獲得','除外')), 0) expected

      from it

      left join call_status_rates s on s.segment = it.seg and s.prev_status = it.st

      left join call_status_rates a on a.segment = 'all' and a.prev_status = it.st

     group by it.list_id

  ), sts as (

    select list_id, jsonb_object_agg(st, n) statuses from (

      select list_id, st, count(*)::int n from it where not ex group by 1, 2) z group by 1

  ), ap as (

    select a.list_id, count(*)::int n from appointments a join l on l.id = a.list_id

     where a.status <> 'キャンセル' and a.created_at > now() - interval '30 days' group by 1

  ), lc as (

    select l.id list_id, (select r.called_at from call_records r where r.list_id = l.id order by r.called_at desc limit 1) t from l

  )

  select l.id, coalesce(agg.total, 0), coalesce(agg.excluded, 0), coalesce(agg.appo_done, 0), coalesce(agg.callable, 0),

         coalesce(agg.expected, 0), coalesce(sts.statuses, '{}'::jsonb), coalesce(ap.n, 0), lc.t,

         coalesce(ll.lap, 0), coalesce(ll.next_pct, 0), l.created_at

    from l left join agg on agg.list_id = l.id left join sts on sts.list_id = l.id

    left join ap on ap.list_id = l.id left join lc on lc.list_id = l.id left join list_laps ll on ll.list_id = l.id

$function$;

CREATE OR REPLACE FUNCTION public.call_find_sections_live(p_org uuid, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid := p_org; v_today text := to_char(now() at time zone 'Asia/Tokyo','YYYY-MM-DD'); v jsonb;
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
end $function$;

create or replace function public.refresh_call_home_cache()
returns void language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  for o in select distinct org_id from call_lists where not coalesce(is_archived, false) and org_id is not null loop
    insert into call_home_cache (org_id, kind, data, refreshed_at)
      values (o, 'home', coalesce((select jsonb_agg(to_jsonb(t)) from public.call_list_home_live(o) t), '[]'::jsonb), now())
      on conflict (org_id, kind) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
    insert into call_home_cache (org_id, kind, data, refreshed_at)
      values (o, 'find200', public.call_find_sections_live(o, 200), now())
      on conflict (org_id, kind) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
    insert into call_home_cache (org_id, kind, data, refreshed_at)
      values (o, 'find5000', public.call_find_sections_live(o, 5000), now())
      on conflict (org_id, kind) do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
  end loop;
end $$;
revoke all on function public.refresh_call_home_cache() from public, anon, authenticated;
revoke all on function public.call_list_home_live(uuid) from public, anon, authenticated;
revoke all on function public.call_find_sections_live(uuid, int) from public, anon, authenticated;

-- ページが呼ぶ方：作っておいた結果を返す
create or replace function public.call_list_home()
returns table (list_id uuid, total integer, excluded integer, appo_done integer, callable integer, expected numeric, statuses jsonb, appo30 integer, last_called timestamp with time zone, lap integer, next_pct integer, created_at timestamp with time zone)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := get_user_org_id(); c call_home_cache;
begin
  select * into c from call_home_cache where org_id = v_org and kind = 'home' and refreshed_at > now() - interval '10 minutes';
  if c.data is null then
    return query select * from public.call_list_home_live(v_org);
    return;
  end if;
  return query select * from jsonb_to_recordset(c.data) as x(list_id uuid, total integer, excluded integer, appo_done integer, callable integer, expected numeric, statuses jsonb, appo30 integer, last_called timestamp with time zone, lap integer, next_pct integer, created_at timestamp with time zone);
end $$;
revoke all on function public.call_list_home() from public, anon;
grant execute on function public.call_list_home() to authenticated;

create or replace function public.call_find_sections(p_limit int default 200)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := get_user_org_id(); c call_home_cache;
begin
  select * into c from call_home_cache where org_id = v_org and kind = case when p_limit <= 200 then 'find200' else 'find5000' end
     and refreshed_at > now() - interval '10 minutes';
  if c.data is null or p_limit > 5000 then return public.call_find_sections_live(v_org, p_limit); end if;
  return c.data;
end $$;
revoke all on function public.call_find_sections(int) from public, anon;
grant execute on function public.call_find_sections(int) to authenticated;

select public.refresh_call_home_cache();
-- 定期更新（DO の中で登録すると動かなかったため、ふつうの文で登録する）
select cron.unschedule('refresh-call-home-cache') where exists (select 1 from cron.job where jobname = 'refresh-call-home-cache');
select cron.schedule('refresh-call-home-cache', '*/2 * * * *', 'SET statement_timeout=''3min''; SELECT public.refresh_call_home_cache();');
