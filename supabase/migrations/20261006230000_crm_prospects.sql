-- 顧客管理 > 開拓：まだアポを取ったことがない潜在顧客の一覧（2026-10-06）
-- 元：自社の営業リスト（M&A・金融商品仲介業者）と、買収タブでつながっている仲介会社。
-- 顧客管理（clients）に同じ社名がある会社と、アポ獲得済みの行は外す。
create or replace function public.crm_norm_company(s text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(normalize(coalesce(s, ''), NFKC),
             '株式会社|有限会社|合同会社|一般社団法人|\(株\)|\(有\)', '', 'g'),
           '[\s・･\-ー－\.,、。()（）]', '', 'g')
$$;

create or replace function public.crm_prospects()
returns table (
  key text, source text, company text, kind text, prefecture text, phone text, url text,
  representative text, employees text, revenue text, business text,
  call_status text, call_count int, last_called_at timestamptz,
  sent_channels text, first_sent_at timestamptz, viewed boolean, site_visited boolean,
  contact_stage text, excluded boolean, exclude_reason text, item_id uuid, list_id uuid
)
language sql stable security invoker set search_path = public as $$
  with org as (select get_user_org_id() id),
  self_lists as (
    select l.id, l.name from call_lists l join clients c on c.id = l.client_id, org
     where c.org_id = org.id and c.name = 'M&Aソーシングパートナーズ株式会社'
       and (l.name like '%- M&A' or l.name like '%金融商品仲介業者%')
  ),
  known as (select crm_norm_company(name) n from clients, org where clients.org_id = org.id),
  calls as (
    select r.item_id, count(*)::int cnt, max(r.called_at) last_at
      from call_records r where r.list_id in (select id from self_lists) group by r.item_id
  ),
  docs as (
    select d.lead_item_id, string_agg(distinct d.channel, '・') ch, min(d.sent_at) first_at,
           bool_or(d.first_view_at is not null) viewed, bool_or(d.first_site_at is not null) site
      from doc_send_stats d, org where d.org_id = org.id and d.lead_item_id is not null group by d.lead_item_id
  ),
  items as (
    select i.id::text key,
           case when sl.name like '%金融商品仲介業者%' then 'IFAリスト' else 'M&Aリスト' end source,
           i.company,
           case when sl.name like '%金融商品仲介業者%' then 'IFA'
                when i.business like '%FA%' then 'FA'
                when i.business like '%仲介%' then '仲介'
                when i.business like '%コンサル%' then 'コンサル'
                when i.business like '%士業%' then '士業'
                else 'M&A（区分不明）' end kind,
           substring(i.address from '^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)') prefecture,
           i.phone, i.url, i.representative, i.employees::text, i.revenue::text, i.business,
           i.call_status, coalesce(c.cnt, 0) call_count, c.last_at,
           d.ch, d.first_at, coalesce(d.viewed, false) viewed, coalesce(d.site, false) site,
           coalesce(i.is_excluded, false) or i.call_status = '除外' excluded, i.exclude_reason,
           i.id item_id, i.list_id
      from call_list_items i
      join self_lists sl on sl.id = i.list_id
      left join calls c on c.item_id = i.id
      left join docs d on d.lead_item_id = i.id
     where coalesce(i.call_status, '') <> 'アポ獲得'
       and crm_norm_company(i.company) not in (select n from known where n <> '')
  ),
  firms as (
    select 'acq:' || f.id::text key, 'つながりのある仲介'::text source, f.name company,
           case f.kind when 'intermediary' then '仲介' when 'sell_side_fa' then 'FA' when 'buy_side_fa' then '買い手FA' else 'その他' end kind,
           null::text prefecture, null::text phone, f.website url, null::text representative, null::text employees,
           null::text revenue, null::text business, null::text call_status, 0 call_count, null::timestamptz last_called_at,
           null::text sent_channels, null::timestamptz first_sent_at, false viewed, false site_visited,
           '買収でつながり'::text contact_stage, false excluded, null::text exclude_reason, null::uuid item_id, null::uuid list_id
      from acq_firms f, org
     where f.org_id = org.id and f.client_id is null
       and crm_norm_company(f.name) not in (select n from known where n <> '')
  )
  select key, source, company, kind, prefecture, phone, url, representative, employees, revenue, business,
         call_status, call_count, last_at, ch, first_at, viewed, site,
         case when excluded then '除外'
              when call_status = 'キーマン断り' then '断られた'
              when viewed or site then '資料・HPを見た'
              when ch is not null then '資料を送った'
              when call_count > 0 then '架電のみ'
              else '未接触' end,
         excluded, exclude_reason, item_id, list_id
    from items
  union all
  select * from firms
$$;
