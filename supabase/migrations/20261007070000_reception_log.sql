-- 会社単位の受付対応の記録（2026-10-07 むー様決定）
-- 受付が出た架電（受付ブロック・受付再コール・キーマン不在）の書き起こしから、受付の対応を短く記録する。
--   call_records.reception = { outcome: blocked|return_time|connected|absent|unknown,
--                              return_hint, receptionist_name, tone: soft|neutral|curt, note }
-- 同じ会社（法人番号、無ければ電話番号）の記録を、リストをまたいで読む。声紋は使わない。
alter table public.call_records add column if not exists reception jsonb;
comment on column public.call_records.reception is '受付の対応（analyze-reception が書き起こしから作る）。声紋は使わない';

create or replace function public.company_key(p_corporate_number text, p_phone text)
returns text language sql immutable as $$
  select coalesce(nullif(regexp_replace(coalesce(p_corporate_number, ''), '\D', '', 'g'), ''),
                  nullif('tel:' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 'tel:'))
$$;
create index if not exists call_list_items_company_key_idx on public.call_list_items (public.company_key(corporate_number, phone));
create index if not exists call_records_reception_todo_idx on public.call_records (called_at) where reception is null and recording_url is not null;

-- 架電ページに出す「この会社の受付」。同じ組織の、同じ会社の記録を新しい順に
create or replace function public.company_reception_history(p_item_id uuid, p_limit int default 20)
returns table (called_at timestamptz, status text, getter_name text, list_label text, client_name text, reception jsonb)
language sql stable security definer set search_path to 'public' as $$
  with me as (select get_user_org_id() as org_id),
  k as (
    select i.org_id, public.company_key(i.corporate_number, i.phone) as key
      from call_list_items i where i.id = p_item_id and i.org_id = (select org_id from me)
  ),
  items as (
    select i.id, i.list_id from call_list_items i, k
     where k.key is not null and i.org_id = k.org_id and public.company_key(i.corporate_number, i.phone) = k.key
  )
  select r.called_at, r.status, r.getter_name, cl.industry, c.name, r.reception
    from call_records r
    join items on items.id = r.item_id
    left join call_lists cl on cl.id = items.list_id
    left join clients c on c.id = cl.client_id
   where r.reception is not null and (r.reception->>'outcome') is distinct from 'skip'
   order by r.called_at desc
   limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.company_reception_history(uuid, int) from public, anon;
grant execute on function public.company_reception_history(uuid, int) to authenticated;
