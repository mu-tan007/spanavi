-- ============================================================
-- 週次 KPI スナップショット (member_kpi_snapshots) から
-- スパキャリ受講生 (rank='student') を除外する
-- ----------------------------------------------------------------
-- 経緯:
--   営業代行系の集計関数を網羅調査した結果、snapshot_member_kpis_weekly
--   だけが members を直接 list して KPI を入れていたため、受講生も
--   member_kpi_snapshots に行が入り、ダッシュボードや個人別 KPI に
--   波及するリスクがあった。
--   他の集計（perf_ranking / get_call_ranking / perf_activity_summary）は
--   call_records / appointments から getter_name 経由で集計するため、
--   受講生は元データを持たず自然に除外される。
-- ============================================================

set local search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.snapshot_member_kpis_weekly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_period_start date;
  v_period_end date;
  v_keyman_labels text[];
begin
  v_period_start := date_trunc('week', current_date - interval '7 days')::date;
  v_period_end := v_period_start + interval '6 days';
  v_keyman_labels := _perf_keyman_connect_labels();

  insert into member_kpi_snapshots (
    org_id, member_id, period_start, period_end,
    calls, connects, appos, sales,
    connect_rate, appo_rate
  )
  select
    m.org_id,
    m.id,
    v_period_start,
    v_period_end,
    coalesce(cs.calls, 0),
    coalesce(cs.connects, 0),
    coalesce(ap.appos, 0),
    coalesce(ap.sales, 0),
    case when coalesce(cs.calls, 0) > 0 then round(coalesce(cs.connects, 0)::numeric / cs.calls * 100, 2) else 0 end,
    case when coalesce(cs.calls, 0) > 0 then round(coalesce(ap.appos, 0)::numeric / cs.calls * 100, 2) else 0 end
  from public.members m
  left join (
    select
      cr.getter_name,
      count(*) as calls,
      count(*) filter (where cr.status = any(v_keyman_labels)) as connects
    from public.call_records cr
    where cr.called_at >= v_period_start::timestamptz
      and cr.called_at < (v_period_end + interval '1 day')::timestamptz
    group by cr.getter_name
  ) cs on cs.getter_name = m.name
  left join (
    select
      a.getter_name,
      count(*) as appos,
      coalesce(sum(case when coalesce(cl.is_prospecting, false) = false then a.sales_amount else 0 end), 0) as sales
    from public.appointments a
    left join public.call_lists cl on cl.id = a.list_id
    where a.created_at >= v_period_start::timestamptz
      and a.created_at < (v_period_end + interval '1 day')::timestamptz
      and a.status in ('アポ取得', '事前確認済', '面談済')
    group by a.getter_name
  ) ap on ap.getter_name = m.name
  where m.is_active = true
    and m.rank is distinct from 'student'  -- スパキャリ受講生を除外
  on conflict (member_id, period_start) do update
    set calls = excluded.calls,
        connects = excluded.connects,
        appos = excluded.appos,
        sales = excluded.sales,
        connect_rate = excluded.connect_rate,
        appo_rate = excluded.appo_rate;
end;
$function$;

-- 既に受講生分の snapshot が入っていれば消す（混入分の浄化）
delete from public.member_kpi_snapshots
where member_id in (
  select id from public.members where rank = 'student'
);
