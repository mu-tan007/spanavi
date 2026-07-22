-- 企業DB専用ラベル（company_master本体=TSR共有マスタは汚さず、org別にタグ管理）。
-- 初期用途: 「M&Aニーズあり」= Excel投入 + M&A売り手ソーシングでアポ獲得の会社を自動付与。
set local search_path = public, extensions;

create table if not exists public.company_db_labels (
  org_id            uuid   not null,
  company_master_id bigint not null,
  label             text   not null,
  source            text,                 -- 'excel_import' | 'manual' | 'auto_ma_appo'
  created_by_name   text,
  created_at        timestamptz not null default now(),
  primary key (org_id, company_master_id, label)
);
create index if not exists idx_cdl_org_label on public.company_db_labels (org_id, label, company_master_id);
create index if not exists idx_cdl_org_cm on public.company_db_labels (org_id, company_master_id);

alter table public.company_db_labels enable row level security;

drop policy if exists cdl_select on public.company_db_labels;
drop policy if exists cdl_insert on public.company_db_labels;
drop policy if exists cdl_delete on public.company_db_labels;
create policy cdl_select on public.company_db_labels for select using (org_id = public.get_user_org_id());
create policy cdl_insert on public.company_db_labels for insert with check (org_id = public.get_user_org_id());
create policy cdl_delete on public.company_db_labels for delete using (org_id = public.get_user_org_id());

-- ── 自動付与: M&A売り手ソーシング(engagement slug=seller_sourcing)でアポ獲得 → M&Aニーズあり ──
create or replace function public.fn_autolabel_ma_needs()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_org uuid;
  v_is_seller boolean;
begin
  if new.status is distinct from 'アポ獲得' or new.item_id is null then
    return new;
  end if;

  select i.org_id, (e.slug = 'seller_sourcing')
    into v_org, v_is_seller
  from public.call_list_items i
  join public.call_lists cl on cl.id = i.list_id
  left join public.engagements e on e.id = cl.engagement_id
  where i.id = new.item_id;

  if not coalesce(v_is_seller, false) then
    return new;
  end if;

  insert into public.company_db_labels (org_id, company_master_id, label, source)
  select v_org, cm.id, 'M&Aニーズあり', 'auto_ma_appo'
  from public.call_list_items i
  join public.company_master cm
    on public.spanavi_norm_company(cm.company_name) = public.spanavi_norm_company(i.company)
   and regexp_replace(coalesce(cm.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g')
  where i.id = new.item_id
    and length(regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g')) >= 10
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_autolabel_ma_needs on public.call_records;
create trigger trg_autolabel_ma_needs
after insert or update of status on public.call_records
for each row execute function public.fn_autolabel_ma_needs();

-- ── 過去分バックフィル（既存の売り手ソーシング アポ獲得） ──
insert into public.company_db_labels (org_id, company_master_id, label, source)
select distinct i.org_id, cm.id, 'M&Aニーズあり', 'auto_ma_appo'
from public.call_records r
join public.call_list_items i on i.id = r.item_id
join public.call_lists cl on cl.id = i.list_id
join public.engagements e on e.id = cl.engagement_id and e.slug = 'seller_sourcing'
join public.company_master cm
  on public.spanavi_norm_company(cm.company_name) = public.spanavi_norm_company(i.company)
 and regexp_replace(coalesce(cm.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g')
where r.status = 'アポ獲得'
  and length(regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g')) >= 10
on conflict do nothing;