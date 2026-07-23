-- アポ一覧(appointments)の M&A売り手ソーシング のアポに対し「M&Aニーズあり」を自動付与。
-- call_records経由のトリガー(fn_autolabel_ma_needs)だけでは appointments 直登録分を取りこぼす
-- ため、authoritative な appointments 側にもトリガーを設ける（両方 on conflict do nothing で冪等）。
set local search_path = public, extensions;

create or replace function public.fn_autolabel_ma_needs_appt()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_is_seller boolean;
begin
  if new.company_name is null or new.engagement_id is null then
    return new;
  end if;
  select (e.slug = 'seller_sourcing') into v_is_seller
  from public.engagements e where e.id = new.engagement_id;
  if not coalesce(v_is_seller, false) then
    return new;
  end if;

  insert into public.company_db_labels (org_id, company_master_id, label, source)
  select new.org_id, cm.id, 'M&Aニーズあり', 'auto_ma_appo'
  from public.company_master cm
  where public.spanavi_norm_company(cm.company_name) = public.spanavi_norm_company(new.company_name)
    and regexp_replace(coalesce(cm.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g')
    and length(regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g')) >= 10
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_autolabel_ma_needs_appt on public.appointments;
create trigger trg_autolabel_ma_needs_appt
after insert or update of engagement_id, company_name, phone on public.appointments
for each row execute function public.fn_autolabel_ma_needs_appt();

-- 取りこぼしバックフィル（既存の売りソ appointments）
insert into public.company_db_labels (org_id, company_master_id, label, source)
select distinct ap.org_id, cm.id, 'M&Aニーズあり', 'auto_ma_appo'
from public.appointments ap
join public.engagements e on e.id = ap.engagement_id and e.slug = 'seller_sourcing'
join public.company_master cm
  on public.spanavi_norm_company(cm.company_name) = public.spanavi_norm_company(ap.company_name)
 and regexp_replace(coalesce(cm.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(ap.phone, ''), '[^0-9]', '', 'g')
where length(regexp_replace(coalesce(ap.phone, ''), '[^0-9]', '', 'g')) >= 10
on conflict do nothing;
