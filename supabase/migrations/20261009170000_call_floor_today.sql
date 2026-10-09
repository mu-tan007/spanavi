-- 架電リストのトップ上段「いま誰がどのリストを」と「チームの今日のアポの貯金」（2026-10-09 むー様・見本 calllist.html）
-- people：今日かけた人ごとの架電数・アポ数・最後の架電（時刻・リスト・結果）
-- shifts：今日のシフト（まだかけていない人を「シフト 17:00〜」と出すため）
-- bank：今日の1回ごとに、その会社の「かける前の状態」の次の1回でアポになる割合を足したもの
-- now：いまの曜日・時間帯の接続率（全業種を架電数で重み付け）・その曜日の平均・その曜日で一番つながる時間帯
create or replace function public.call_floor_today()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := get_user_org_id(); v_d0 timestamptz; v_dow int; v_h int; v_out jsonb;
begin
  v_d0 := ((now() at time zone 'Asia/Tokyo')::date)::timestamp at time zone 'Asia/Tokyo';
  v_dow := extract(dow from now() at time zone 'Asia/Tokyo')::int;
  v_h := extract(hour from now() at time zone 'Asia/Tokyo')::int;
  with r as (
    select r.id, r.item_id, r.list_id, r.getter_name g, r.status, r.called_at
      from call_records r
     where r.org_id = v_org and r.called_at >= v_d0 and r.getter_name is not null and r.getter_name not in ('全社', '自動除外')
  ), last as (
    select distinct on (g) g, called_at, status, list_id from r order by g, called_at desc
  ), ppl as (
    select r.g, count(*) calls, max(r.called_at) last_at from r group by r.g
  ), ap as (
    select a.getter_name g, count(*) n from appointments a
     where a.org_id = v_org and a.created_at >= v_d0 and a.status <> 'キャンセル' group by 1
  ), seg as (
    select l.id, case when e.slug in ('seller_sourcing','matching','lead_generation_ifa','client_acquisition','client_acquisition_ifa') then e.slug else 'all' end s
      from call_lists l left join engagements e on e.id = l.engagement_id where l.org_id = v_org
  ), bank_g as (
    select x.g, coalesce(sum(coalesce(s.rate, a.rate, 0)), 0) bv from (
      select r.g, r.list_id, coalesce((select p.status from call_records p where p.item_id = r.item_id and p.called_at < r.called_at order by p.called_at desc limit 1), '未架電') st
        from r where r.item_id is not null) x
      left join seg on seg.id = x.list_id
      left join call_status_rates s on s.segment = seg.s and s.prev_status = x.st
      left join call_status_rates a on a.segment = 'all' and a.prev_status = x.st
     group by x.g
  ), bank as (
    select coalesce(sum(bv), 0) bv from bank_g
  ), cr as (
    select hour, sum(keyman)::numeric / nullif(sum(calls), 0) rate, sum(calls) calls from industry_connect_rates where dow = v_dow group by hour
  )
  select jsonb_build_object(
    'people', (select coalesce(jsonb_agg(jsonb_build_object('name', p.g, 'calls', p.calls, 'appos', coalesce(ap.n, 0), 'last_at', p.last_at, 'bank', coalesce(bg.bv, 0),
                 'last_status', last.status, 'list_id', last.list_id, 'client', cl.name, 'list', l.industry, 'list_name', l.name) order by p.last_at desc), '[]')
                 from ppl p join last on last.g = p.g left join ap on ap.g = p.g left join bank_g bg on bg.g = p.g
                 left join call_lists l on l.id = last.list_id left join clients cl on cl.id = l.client_id),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(m.name, s.member_name), 'start', s.start_time, 'end', s.end_time) order by s.start_time), '[]')
                 from shifts s left join members m on m.id = s.member_id
                where s.org_id = v_org and s.shift_date = (now() at time zone 'Asia/Tokyo')::date),
    'appos_today', (select coalesce(sum(n), 0) from ap),
    'bank', (select bv from bank),
    'now', jsonb_build_object('dow', v_dow, 'hour', v_h,
       'rate', (select rate from cr where hour = v_h and calls >= 150),
       'avg', (select rate from cr where hour = -1),
       'best_hour', (select hour from cr where hour between 8 and 19 and calls >= 150 order by rate desc limit 1),
       'best_rate', (select rate from cr where hour between 8 and 19 and calls >= 150 order by rate desc limit 1))
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.call_floor_today() from public, anon;
grant execute on function public.call_floor_today() to authenticated;
