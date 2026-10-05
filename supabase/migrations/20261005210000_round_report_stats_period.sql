-- 周回報告：累計に期間（最初と最後の架電日）を足す。途中報告（kind='manual'）の見出しに使う（2026-10-05 篠宮）
set lock_timeout = '5s';

create or replace function public.round_report_stats(p_list_id uuid, p_round integer)
returns jsonb
language sql stable security definer set search_path = public as $$
  with recs as (
    select round, status, item_id, called_at at time zone 'Asia/Tokyo' as jst
      from call_records where list_id = p_list_id and round is not null and round <= p_round
  ),
  per_round as (
    select round,
           count(*)::int as calls,
           count(distinct item_id)::int as companies,
           count(*) filter (where status in ('キーマン断り', 'キーマン再コール', 'アポ獲得'))::int as talks,
           count(*) filter (where status = 'アポ獲得')::int as appo,
           min(jst)::date as first_day,
           max(jst)::date as last_day
      from recs group by round
  ),
  slots as (
    select extract(isodow from jst)::int as dow, extract(hour from jst)::int as hour,
           count(*)::int as calls,
           count(*) filter (where status in ('キーマン断り', 'キーマン再コール', 'アポ獲得'))::int as talks
      from recs group by 1, 2
  )
  select jsonb_build_object(
    'round', p_round,
    'this', (select to_jsonb(p) from per_round p where p.round = p_round),
    'prev', (select to_jsonb(p) from per_round p where p.round = p_round - 1),
    'rounds', coalesce((select jsonb_agg(to_jsonb(p) order by p.round) from per_round p), '[]'::jsonb),
    'total', (select jsonb_build_object(
                'calls', count(*), 'companies', count(distinct item_id),
                'talks', count(*) filter (where status in ('キーマン断り', 'キーマン再コール', 'アポ獲得')),
                'appo', count(*) filter (where status = 'アポ獲得'),
                'first_day', min(jst)::date, 'last_day', max(jst)::date)
                from recs),
    'list_size', (select count(*) from call_list_items where list_id = p_list_id and not coalesce(is_excluded, false)),
    'best_slots', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.rate desc)
        from (select dow, hour, calls, talks, round(talks::numeric / calls, 4) as rate
                from slots where calls >= 30 order by talks::numeric / calls desc limit 3) s
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.round_report_stats(uuid, integer) from public, anon, authenticated;
grant execute on function public.round_report_stats(uuid, integer) to service_role;
