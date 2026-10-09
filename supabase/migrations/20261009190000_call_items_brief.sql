-- 架電ページの「この後の会社」と、いまの会社の注意（2026-10-09 むー様・見本 call.html）
-- 渡した会社ごとに：業種・代表者とふりがな・売上・純利益・いまの状態・前回（日時と人）・次の約束・
--   other_today：今日、別のリストで同じ会社にかけた人（最新）
--   other_ng：別のリストで同じ会社のキーマン断り（最新・社長の温度感と理由）
create or replace function public.call_items_brief(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  with it as (
    select i.*, public.company_key(i.corporate_number, i.phone) ck
      from call_list_items i
     where i.id = any(p_ids) and i.org_id = get_user_org_id()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', it.id, 'list_id', it.list_id, 'no', it.no, 'c', it.company, 'ind', coalesce(it.industry_group, ''),
    'rep', it.representative, 'k', it.representative_kana, 'rv', it.revenue, 'ni', it.net_income,
    'st', coalesce(nullif(it.call_status, ''), '未架電'),
    'last', (select jsonb_build_object('at', r.called_at, 'g', r.getter_name, 's', r.status,
                    'rd', substring(r.memo from '"recall_date":"([0-9-]+)"'), 'rt', substring(r.memo from '"recall_time":"([0-9:]+)"'))
               from call_records r where r.item_id = it.id order by r.called_at desc limit 1),
    'other_today', case when it.ck is null then null else (
       select jsonb_build_object('at', r.called_at, 'g', r.getter_name, 's', r.status, 'client', cl.name)
         from call_list_items j join call_records r on r.item_id = j.id
         join call_lists l on l.id = j.list_id left join clients cl on cl.id = l.client_id
        where public.company_key(j.corporate_number, j.phone) = it.ck and j.list_id <> it.list_id
          and r.called_at >= ((now() at time zone 'Asia/Tokyo')::date)::timestamp at time zone 'Asia/Tokyo'
        order by r.called_at desc limit 1) end,
    'other_ng', case when it.ck is null then null else (
       select jsonb_build_object('at', r.called_at, 'g', r.getter_name, 'temp', r.ceo_temp, 'reasons', r.ceo_temp_reasons, 'quote', r.ceo_temp_quote, 'client', cl.name)
         from call_list_items j join call_records r on r.item_id = j.id
         join call_lists l on l.id = j.list_id left join clients cl on cl.id = l.client_id
        where public.company_key(j.corporate_number, j.phone) = it.ck and j.list_id <> it.list_id and r.status = 'キーマン断り'
        order by r.called_at desc limit 1) end
  ) order by array_position(p_ids, it.id)), '[]'::jsonb)
  from it
$$;
revoke all on function public.call_items_brief(uuid[]) from public, anon;
grant execute on function public.call_items_brief(uuid[]) to authenticated;
