-- 企業DB（company_master）で1社を開いたとき、その企業が含まれる全リスト
-- （稼働中＋アーカイブ）での架電履歴（リスト別・ラウンド別ステータス）を返す。
-- 突合キーは「正規化企業名 かつ 電話番号」の両一致（自動除外と同一思想）。
-- 未架電の登録行も返す（call_records を LEFT JOIN）。
set local search_path = public, extensions;

create or replace function public.get_company_call_history(p_company text, p_phone text)
returns table (
  list_id          uuid,
  list_name        text,
  is_archived      boolean,
  item_id          uuid,
  item_company     text,
  item_call_status text,
  round            integer,
  status           text,
  called_at        timestamptz,
  getter_name      text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with params as (
    select public.get_user_org_id() as org,
           public.spanavi_norm_company(p_company) as nc,
           regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as np
  )
  select l.id, l.name, coalesce(l.is_archived, false),
         i.id, i.company, i.call_status,
         r.round, r.status, r.called_at, r.getter_name
  from params p
  join public.call_list_items i
    on i.org_id = p.org
   and public.spanavi_norm_company(i.company) = p.nc
   and regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g') = p.np
  join public.call_lists l on l.id = i.list_id
  left join public.call_records r on r.item_id = i.id
  where p.org is not null
    and p.nc is not null
    and length(p.np) >= 10
  order by coalesce(l.is_archived, false) asc, l.created_at asc nulls last, l.name asc,
           r.round asc nulls first, r.called_at asc nulls first;
$$;

comment on function public.get_company_call_history(text, text) is
  '企業名＋電話一致で、全リスト（稼働中/アーカイブ）の架電履歴（リスト別ラウンド別ステータス）を返す。企業DB詳細用。';

grant execute on function public.get_company_call_history(text, text) to authenticated, service_role;
