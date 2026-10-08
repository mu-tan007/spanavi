-- 架電リストのページの「あと何件でアポ1件」（2026-10-08 むー様）
-- リストごとに、まだかけられる会社（除外・アポ獲得・除外ステータスを除く）へ、直前の結果ごとのアポ率（call_status_rates）を当てて足す。
-- 区分はリストの業務（engagements.slug）。5区分以外の業務は「all」。区分にその状態の行が無いときも「all」の率を使う。
create or replace function public.list_appo_outlook()
returns table (list_id uuid, callable integer, expected numeric)
language sql stable security invoker set search_path = public as $$
  with it as (
    select i.list_id, coalesce(nullif(i.call_status, ''), '未架電') st,
           case when e.slug in ('seller_sourcing','matching','lead_generation_ifa','client_acquisition','client_acquisition_ifa') then e.slug else 'all' end seg
    from call_list_items i
    join call_lists l on l.id = i.list_id
    left join engagements e on e.id = l.engagement_id
    where not coalesce(l.is_archived, false) and not coalesce(i.is_excluded, false)
      and coalesce(i.call_status, '') not in ('アポ獲得', '除外')
  )
  select it.list_id, count(*)::int, sum(coalesce(s.rate, a.rate, 0))
  from it
  left join call_status_rates s on s.segment = it.seg and s.prev_status = it.st
  left join call_status_rates a on a.segment = 'all' and a.prev_status = it.st
  group by it.list_id
$$;
grant execute on function public.list_appo_outlook() to authenticated;
