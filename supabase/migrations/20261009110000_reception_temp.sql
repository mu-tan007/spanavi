-- 受付の温度感（2026-10-09 むー様）
-- 高：社長につないでくれた・戻り時間を教えてくれた ／ 中：不在で戻り時間も分からない ／ 低：営業お断り・一切結構（受付で止められた）
-- 1回の架電の結果と、AIが抜き出した受付のやり取り（reception）から決める。不通・除外などは付けない。
create or replace function public.reception_level(p_status text, p_reception jsonb, p_memo text)
returns text language sql immutable as $$
  select case
    when p_status in ('キーマン断り','キーマン再コール','アポ獲得') then '高'
    when p_reception->>'outcome' = 'connected' then '高'
    when coalesce(p_reception->>'return_hint','') <> '' or p_reception->>'outcome' = 'return_time' then '高'
    when p_status = '受付再コール' and coalesce(substring(p_memo from '"recall_time":"([0-9:]+)"'),'') <> '' then '高'
    when p_status = '受付ブロック' or p_reception->>'outcome' = 'blocked' then '低'
    when p_status in ('キーマン不在','受付再コール') or p_reception->>'outcome' = 'absent' then '中'
    else null end
$$;

-- 同じ会社（法人番号、無ければ電話番号）の受付の温度感を、リストをまたいで最新の1件。根拠の一言・いつ・どのクライアントの話か付き
create or replace function public.company_reception_temp(p_item_id uuid)
returns table (level text, evidence text, called_at timestamptz, client_name text, getter_name text)
language sql stable security definer set search_path to 'public' as $$
  with me as (select get_user_org_id() as org_id),
  k as (
    select i.org_id, public.company_key(i.corporate_number, i.phone) as key
      from call_list_items i where i.id = p_item_id and i.org_id = (select org_id from me)
  ),
  items as (
    select i.id, i.list_id from call_list_items i, k
     where k.key is not null and i.org_id = k.org_id and public.company_key(i.corporate_number, i.phone) = k.key
  ),
  rs as (
    select r.*, items.list_id l_id, public.reception_level(r.status, r.reception, r.memo) lv
      from call_records r join items on items.id = r.item_id
  )
  select rs.lv,
         coalesce(nullif(rs.reception->>'return_hint',''), nullif(rs.reception->>'note',''),
           case rs.lv when '高' then case when rs.status in ('キーマン断り','キーマン再コール','アポ獲得') then '社長につないでくれた'
                                        else '戻り時間を教えてくれた（' || coalesce(substring(rs.memo from '"recall_time":"([0-9:]+)"'),'') || '）' end
                      when '中' then '不在・戻り時間は分からない'
                      when '低' then '受付で止められた' end),
         rs.called_at, c.name, rs.getter_name
    from rs left join call_lists cl on cl.id = rs.l_id left join clients c on c.id = cl.client_id
   where rs.lv is not null
   order by rs.called_at desc
   limit 1
$$;
revoke all on function public.company_reception_temp(uuid) from public, anon;
grant execute on function public.company_reception_temp(uuid) to authenticated;
