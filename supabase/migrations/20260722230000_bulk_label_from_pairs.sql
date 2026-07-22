-- (企業名, 電話) のペア配列を受け取り、company_master に突合して企業DBラベルを一括付与。
-- アプリ内Excel/CSV取り込み用（ブラウザがファイルを解析してバッチ送信）。突合は企業名＋電話。
set local search_path = public, extensions;

create or replace function public.bulk_label_from_pairs(p_label text, p_pairs jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_org uuid := public.get_user_org_id();
  v_input int;
  v_matched int;
  v_inserted int;
begin
  if v_org is null or p_label is null or p_pairs is null then
    return jsonb_build_object('error','no org/label/pairs');
  end if;

  create temporary table _pairs on commit drop as
  select public.spanavi_norm_company(x->>'n') as nc,
         regexp_replace(coalesce(x->>'p',''),'[^0-9]','','g') as np
  from jsonb_array_elements(p_pairs) x;

  select count(*) into v_input from _pairs;

  create temporary table _matched on commit drop as
  select distinct cm.id as company_master_id
  from _pairs p
  join public.company_master cm
    on public.spanavi_norm_company(cm.company_name) = p.nc
   and regexp_replace(coalesce(cm.phone,''),'[^0-9]','','g') = p.np
  where p.nc is not null and length(p.np) >= 10;

  select count(*) into v_matched from _matched;

  with ins as (
    insert into public.company_db_labels(org_id, company_master_id, label, source)
    select v_org, m.company_master_id, p_label, 'excel_import'
    from _matched m
    on conflict do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return jsonb_build_object('input', v_input, 'matched', v_matched, 'inserted', v_inserted);
end;
$$;

grant execute on function public.bulk_label_from_pairs(text, jsonb) to authenticated, service_role;
