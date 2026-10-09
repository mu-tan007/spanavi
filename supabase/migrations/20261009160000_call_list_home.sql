-- 架電リストのトップ「リスト」タブの数字（2026-10-09 むー様・見本 calllist.html を本番へ）
-- リストごとに：元の社数・除外・アポ獲得済み・架電可能・見込みアポ・いまの状態の内訳・直近1か月のアポ・最終架電・周回
drop function if exists public.call_list_home();
create index if not exists call_records_list_called on public.call_records (list_id, called_at desc);
create or replace function public.call_list_home()
returns table (list_id uuid, total int, excluded int, appo_done int, callable int, expected numeric,
               statuses jsonb, appo30 int, last_called timestamptz, lap int, next_pct int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with l as (
    select l.id, l.created_at, case when e.slug in ('seller_sourcing','matching','lead_generation_ifa','client_acquisition','client_acquisition_ifa') then e.slug else 'all' end seg
      from call_lists l left join engagements e on e.id = l.engagement_id
     where l.org_id = public.get_user_org_id() and not coalesce(l.is_archived, false)
  ), it as (
    select i.list_id, coalesce(i.is_excluded, false) ex, coalesce(nullif(i.call_status, ''), '未架電') st, l.seg
      from call_list_items i join l on l.id = i.list_id
  ), agg as (
    select it.list_id, count(*)::int total, count(*) filter (where ex)::int excluded,
           count(*) filter (where not ex and st = 'アポ獲得')::int appo_done,
           count(*) filter (where not ex and st not in ('アポ獲得','除外'))::int callable,
           coalesce(sum(coalesce(s.rate, a.rate, 0)) filter (where not ex and st not in ('アポ獲得','除外')), 0) expected
      from it
      left join call_status_rates s on s.segment = it.seg and s.prev_status = it.st
      left join call_status_rates a on a.segment = 'all' and a.prev_status = it.st
     group by it.list_id
  ), sts as (
    select list_id, jsonb_object_agg(st, n) statuses from (
      select list_id, st, count(*)::int n from it where not ex group by 1, 2) z group by 1
  ), ap as (
    select a.list_id, count(*)::int n from appointments a join l on l.id = a.list_id
     where a.status <> 'キャンセル' and a.created_at > now() - interval '30 days' group by 1
  ), lc as (
    select l.id list_id, (select r.called_at from call_records r where r.list_id = l.id order by r.called_at desc limit 1) t from l
  )
  select l.id, coalesce(agg.total, 0), coalesce(agg.excluded, 0), coalesce(agg.appo_done, 0), coalesce(agg.callable, 0),
         coalesce(agg.expected, 0), coalesce(sts.statuses, '{}'::jsonb), coalesce(ap.n, 0), lc.t,
         coalesce(ll.lap, 0), coalesce(ll.next_pct, 0), l.created_at
    from l left join agg on agg.list_id = l.id left join sts on sts.list_id = l.id
    left join ap on ap.list_id = l.id left join lc on lc.list_id = l.id left join list_laps ll on ll.list_id = l.id
$$;
revoke all on function public.call_list_home() from public, anon;
grant execute on function public.call_list_home() to authenticated;
