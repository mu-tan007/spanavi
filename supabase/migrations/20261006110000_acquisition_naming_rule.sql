-- 買収タブ：案件の名前のルール（むー様 2026-10-06）
--   IM開示後 … 案件名＝企業名（acq_deals.name、正式な商号）
--   IM開示前 … ノンネームの名称（acq_deals.project_name）を「業種（地域）」にそろえる
--   PJ名・資料上の呼び名（PJ orange・T社 など）は名前に混ぜず pj_code に分ける
--   im_disclosed … 企業名がある／IMの書類がある／IM受領・トップ面談以降の段階を通った、のどれかなら IM開示後（ノンネームでのQAは開示前）
set lock_timeout = '5s';
alter table public.acq_deals add column if not exists pj_code text;
drop view if exists public.acq_firm_stats;
drop view if exists public.acq_deal_list;
create view public.acq_deal_list
with (security_invoker = true) as
select
  d.*,
  coalesce(d.name, d.project_name) as display_name,
  (d.name is not null
    or coalesce(docs.has_im, false)
    or exists (select 1 from public.acq_deal_stage_events e2 where e2.deal_id = d.id
                and e2.stage in ('im_received','top_meeting','loi_submitted','basic_agreement','dd','definitive_agreement','closed_won'))
  ) as im_disclosed,
  st.stage as current_stage,
  st.occurred_on as stage_on,
  sf.name as source_firm_name,
  sc.name as source_contact_name,
  ss.name as sell_side_firm_name,
  fin_ours.ebitda as ebitda_ours,
  fin_im.ebitda as ebitda_im,
  coalesce(fin_ours.revenue, fin_im.revenue) as revenue,
  coalesce(fin_ours.net_cash, fin_im.net_cash) as net_cash,
  case
    when coalesce(fin_ours.ebitda, fin_im.ebitda) > 0 and coalesce(d.asking_price_min, d.asking_price_max) is not null
    then round(((coalesce(d.asking_price_min, d.asking_price_max) + coalesce(d.asking_price_max, d.asking_price_min)) / 2.0)
               / coalesce(fin_ours.ebitda, fin_im.ebitda), 1)
  end as multiple,
  docs.has_nonname, docs.has_im, docs.has_qa, docs.doc_count,
  act.last_activity_at
from public.acq_deals d
left join lateral (
  select e.stage, e.occurred_on from public.acq_deal_stage_events e
   where e.deal_id = d.id order by e.occurred_on desc, e.seq desc limit 1
) st on true
left join public.acq_firms sf on sf.id = d.source_firm_id
left join public.acq_contacts sc on sc.id = d.source_contact_id
left join public.acq_firms ss on ss.id = d.sell_side_firm_id
left join lateral (
  select f.* from public.acq_deal_financials f where f.deal_id = d.id and f.source = 'ours'
   order by f.period_end desc nulls last, f.created_at desc limit 1
) fin_ours on true
left join lateral (
  select f.* from public.acq_deal_financials f where f.deal_id = d.id and f.source = 'im'
   order by f.period_end desc nulls last, f.created_at desc limit 1
) fin_im on true
left join lateral (
  select bool_or(x.doc_type = 'nonname') as has_nonname,
         bool_or(x.doc_type = 'im') as has_im,
         bool_or(x.doc_type = 'qa') as has_qa,
         count(*) as doc_count
    from public.acq_documents x where x.deal_id = d.id
) docs on true
left join lateral (
  select max(a.occurred_at) as last_activity_at
    from public.acq_activity_deals ad join public.acq_activities a on a.id = ad.activity_id
   where ad.deal_id = d.id
) act on true;


create view public.acq_firm_stats
with (security_invoker = true) as
select
  f.*,
  (select count(*) from public.acq_contacts c where c.firm_id = f.id) as contact_count,
  count(l.id) filter (where l.current_stage is distinct from 'candidate') as deal_count,
  count(l.id) filter (where exists (
     select 1 from public.acq_deal_stage_events e where e.deal_id = l.id
        and e.stage in ('top_meeting','loi_submitted','basic_agreement','dd','definitive_agreement','closed_won'))) as top_meeting_count,
  max(l.received_on) filter (where l.current_stage is distinct from 'candidate') as last_received_on
from public.acq_firms f
left join public.acq_deal_list l on l.source_firm_id = f.id
group by f.id;
