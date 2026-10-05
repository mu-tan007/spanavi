-- 買収タブ：配信を受けただけの案件は載せない（むー様 2026-10-06）
--   買収タブに載せるのは、弊社から仲介会社などへ関心を伝えてやり取りを始めた案件だけ。
--   一方的な配信は Slack #買収案件 に通知するだけにする（/haishin）。
--   これまでに /haishin が入れた「配信から候補」（stage='candidate'）と、その配信メールのやり取りを消す。
set lock_timeout = '5s';
delete from public.acq_activities a
 where a.source_kind = 'gmail' and a.subject like '配信：%'
   and exists (select 1 from public.acq_activity_deals ad join public.acq_deals d on d.id = ad.deal_id
                where ad.activity_id = a.id and d.source_ref like 'broadcast:%');
delete from public.acq_deals where source_ref like 'broadcast:%';
delete from public.acq_firms f where f.name = '株式会社バトンズ'
   and not exists (select 1 from public.acq_deals d where d.source_firm_id = f.id or d.sell_side_firm_id = f.id)
   and not exists (select 1 from public.acq_contacts c where c.firm_id = f.id);

-- 一覧の「トップ面談まで進んだ案件」用
create or replace view public.acq_deal_list
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
  act.last_activity_at,
  exists (select 1 from public.acq_deal_stage_events e3 where e3.deal_id = d.id
           and e3.stage in ('top_meeting','loi_submitted','basic_agreement','dd','definitive_agreement','closed_won')) as reached_top_meeting
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
