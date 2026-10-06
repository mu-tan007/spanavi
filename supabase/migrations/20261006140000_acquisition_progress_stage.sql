-- 買収タブ：現在の段階を「いちばん先まで進んだ段階」で出す（2026-10-06）
--   日付が後の記録でも、前の段階（例：トップ面談のあとのQA＝IM済）で現在地を戻さない（EVCで発生）
--   見送り・不成約・ネームクリア不可は、そのあとに進捗の記録が無ければ終了中。progress_stage でどこまで進んで止まったかを出す
set lock_timeout = '5s';
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
  case when cl.is_closed then tm.stage else pr.stage end as current_stage,
  case when cl.is_closed then tm.occurred_on else pr.occurred_on end as stage_on,
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
           and e3.stage in ('top_meeting','loi_submitted','basic_agreement','dd','definitive_agreement','closed_won')) as reached_top_meeting,
  pr.stage as progress_stage,
  pr.rank as progress_rank,
  cl.is_closed
from public.acq_deals d
-- いちばん先まで進んだ段階（日付が後でも、前の段階の記録で現在地を戻さない）
left join lateral (
  select e.stage, e.occurred_on, e.seq,
         case e.stage when 'received' then 1 when 'nonname' then 2 when 'im_received' then 3 when 'top_meeting' then 4
                      when 'loi_submitted' then 5 when 'dd' then 6 when 'definitive_agreement' then 7 when 'closed_won' then 8 end as rank
    from public.acq_deal_stage_events e
   where e.deal_id = d.id and e.stage in ('received','nonname','im_received','top_meeting','loi_submitted','dd','definitive_agreement','closed_won')
   order by 4 desc, e.occurred_on desc, e.seq desc limit 1
) pr on true
-- 最後の進捗の記録（見送り後に再開したかの判定用）
left join lateral (
  select e.occurred_on, e.seq from public.acq_deal_stage_events e
   where e.deal_id = d.id and e.stage in ('received','nonname','im_received','top_meeting','loi_submitted','dd','definitive_agreement','closed_won')
   order by e.occurred_on desc, e.seq desc limit 1
) lp on true
-- 最後の終了（見送り・不成約・ネームクリア不可）。そのあとに進捗の記録が無ければ終了中
left join lateral (
  select e.stage, e.occurred_on, e.seq from public.acq_deal_stage_events e
   where e.deal_id = d.id and e.stage in ('declined_by_us','lost','name_clear_denied')
   order by e.occurred_on desc, e.seq desc limit 1
) tm on true
cross join lateral (
  select (tm.stage is not null and (lp.occurred_on is null or (tm.occurred_on, tm.seq) >= (lp.occurred_on, lp.seq))) as is_closed
) cl
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
  count(l.id) as deal_count,
  count(l.id) filter (where l.reached_top_meeting) as top_meeting_count,
  max(l.received_on) as last_received_on
from public.acq_firms f
left join public.acq_deal_list l on l.source_firm_id = f.id
group by f.id;
