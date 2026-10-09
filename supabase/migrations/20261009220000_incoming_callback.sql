-- 着信からアポにつなげる（2026-10-09 むー様）
-- ① 折り返して結果を記録したら、その番号の未対応の着信を自動で対応済にする（過去の分もそろえる）
-- ② 着信ボード：着信ごとに、会社・前回の架電・約束・社長の温度感・会社が分からない番号の候補を返す

-- 番号を数字だけ・国番号81は0始まりにそろえる
create or replace function public.tel_norm(t text) returns text language sql immutable as $$
  select case when d like '81%' and length(d) >= 11 then '0' || substr(d, 3) else d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') d) x
$$;

create or replace function public.incoming_mark_handled()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nums text[];
begin
  if new.item_id is null then return new; end if;
  select array_remove(array[public.tel_norm(i.phone), public.tel_norm(i.sub_phone_number), public.tel_norm(i.keyman_mobile)], '')
    into v_nums from call_list_items i where i.id = new.item_id;
  if v_nums is null or array_length(v_nums, 1) is null then return new; end if;
  update incoming_calls ic set status = '対応済み', handled_at = coalesce(new.called_at, now()), handled_by = new.getter_name,
         item_id = coalesce(ic.item_id, new.item_id)
   where ic.org_id = new.org_id and ic.status <> '対応済み'
     and ic.received_at <= coalesce(new.called_at, now()) and ic.received_at > coalesce(new.called_at, now()) - interval '30 days'
     and public.tel_norm(ic.caller_number) = any(v_nums);
  return new;
end $$;
drop trigger if exists trg_incoming_mark_handled on public.call_records;
create trigger trg_incoming_mark_handled after insert on public.call_records
  for each row execute function public.incoming_mark_handled();

-- 過去の分：着信のあと30日以内に、その番号の会社へ架電の記録があれば対応済にする
with ic as (
  select c.id, c.org_id, c.received_at, public.tel_norm(c.caller_number) n from incoming_calls c where c.status <> '対応済み' and coalesce(c.caller_number, '') <> ''
), hit as (
  select distinct on (ic.id) ic.id, r.called_at, r.getter_name, i.id item_id
    from ic join call_list_items i on i.org_id = ic.org_id and i.id in (
      select j.id from call_list_items j where j.phone = ic.n union select j.id from call_list_items j where j.sub_phone_number = ic.n
      union select j.id from call_list_items j where j.keyman_mobile = ic.n)
    join call_records r on r.item_id = i.id and r.called_at >= ic.received_at and r.called_at < ic.received_at + interval '30 days'
   order by ic.id, r.called_at
)
update incoming_calls c set status = '対応済み', handled_at = hit.called_at, handled_by = hit.getter_name, item_id = coalesce(c.item_id, hit.item_id)
  from hit where hit.id = c.id;

-- 着信ボード（直近 p_days 日・新しい順）
create or replace function public.incoming_board(p_days int default 45)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := get_user_org_id(); v jsonb;
begin
  with ic as materialized (
    select c.*, public.tel_norm(c.caller_number) n, m.name callee
      from incoming_calls c left join members m on m.zoom_user_id = c.answered_by_zoom_user_id and m.org_id = c.org_id
     where c.org_id = v_org and c.received_at > now() - make_interval(days => p_days)
  ), mt as materialized (
    select distinct x.inc_id, i.id item_id, i.list_id, i.company, coalesce(nullif(i.call_status, ''), '未架電') st, l.name list_name, l.industry list_ind, cl.name client
      from (
        select ic.id inc_id, i.id iid from ic join call_list_items i on i.phone = ic.n where ic.n <> ''
        union select ic.id, i.id from ic join call_list_items i on i.sub_phone_number = ic.n where ic.n <> ''
        union select ic.id, i.id from ic join call_list_items i on i.keyman_mobile = ic.n where ic.n <> ''
      ) x join call_list_items i on i.id = x.iid and i.org_id = v_org
      join call_lists l on l.id = i.list_id left join clients cl on cl.id = l.client_id
     where not coalesce(l.is_archived, false)
  ), mt2 as (
    select mt.*,
      (select jsonb_build_object('at', r.called_at, 'g', r.getter_name, 's', r.status,
               'rd', substring(r.memo from '"recall_date":"([0-9-]+)"'), 'rt', substring(r.memo from '"recall_time":"([0-9:]+)"'), 'nt', substring(r.memo from '"note":"([^"]*)"'),
               -- 会話の中身：社長の発言・断りの理由、折り返しの話が出たか（書き起こしかメモに「折り返」）とその前後の一言
               'q', r.ceo_temp_quote, 'rr', r.rejection_reason,
               'cb', (coalesce(r.transcript, '') like '%折り返%' or coalesce(r.memo, '') like '%折り返%'),
               'cbs', case when coalesce(r.transcript, '') like '%折り返%'
                        then regexp_replace(substring(r.transcript from greatest(1, position('折り返' in r.transcript) - 40) for 90), '\[[0-9:]+\]\s*', ' ', 'g') end)
         from call_records r where r.item_id = mt.item_id order by r.called_at desc limit 1) last,
      (select r.ceo_temp from call_records r where r.item_id = mt.item_id and r.ceo_temp is not null order by r.called_at desc limit 1) ceo
      from mt
  ), cand as (
    -- 会社が分からない未対応の着信だけ：着信を受けた人が、その前の7日間にかけた会社（新しい順に3社）
    select ic.id inc_id,
      (select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'at', c.at, 's', c.s, 'company', i.company, 'list_ind', l.industry, 'client', cl.name) order by c.at desc)
         from (select * from (
                 select distinct on (r.item_id) r.item_id, r.called_at at, r.status s
                   from call_records r
                  where r.org_id = v_org and r.getter_name = ic.callee
                    and r.called_at < ic.received_at and r.called_at > ic.received_at - interval '7 days' and r.status <> '不通'
                  order by r.item_id, r.called_at desc) d
               order by d.at desc limit 3) c
         join call_list_items i on i.id = c.item_id join call_lists l on l.id = i.list_id left join clients cl on cl.id = l.client_id) cands
      from ic
     where ic.status <> '対応済み' and ic.callee is not null and not exists (select 1 from mt where mt.inc_id = ic.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ic.id, 'at', ic.received_at, 'n', ic.n, 'raw', ic.caller_number, 'callee', ic.callee, 'status', ic.status,
      'handled_at', ic.handled_at, 'handled_by', ic.handled_by, 'rec', ic.recording_url, 'zid', ic.answered_by_zoom_user_id,
      'company_name', ic.company_name,
      'matches', (select coalesce(jsonb_agg(to_jsonb(m2) - 'inc_id'), '[]'::jsonb) from mt2 m2 where m2.inc_id = ic.id),
      'cands', (select cand.cands from cand where cand.inc_id = ic.id)
    ) order by ic.received_at desc), '[]'::jsonb) into v
  from ic;
  return v;
end $$;
revoke all on function public.incoming_board(int) from public, anon;
grant execute on function public.incoming_board(int) to authenticated;
