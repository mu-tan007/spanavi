-- notify-ranking(Slack通知) をアナリティクス画面と完全一致させるための org 指定版 RPC。
-- 背景: Slack通知 Edge Function が getter_name を JS で独自カウントしており、
--       (1) org 絞り込みが無く「Spanavi デモ」org のダミーデータが混入、
--       (2) 売上が appointment_date / 今日まで で、画面(SalesRanking= meeting_date / 月全体)とズレる、
--       という不一致があった。
-- 方針: 画面が使う perf_ranking と同一ロジックを org をパラメータで受ける形で提供し、
--       Edge Function 側もこれを呼ぶことで「定義の二重管理」を無くし恒久的に一致させる。
-- 既存 perf_ranking / _perf_keyman_connect_labels は触らない（画面側の挙動は不変）。

set local search_path = public, extensions;

-- キーマン接続ラベル（org 指定版）。_perf_keyman_connect_labels() の org パラメータ版。
create or replace function public._perf_keyman_connect_labels_org(p_org uuid)
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_labels text[];
  v_raw text;
begin
  select setting_value into v_raw
  from public.org_settings
  where org_id = p_org
    and setting_key = 'call_statuses';

  if v_raw is not null then
    select array_agg(elem->>'label')
    into v_labels
    from jsonb_array_elements(v_raw::jsonb) as elem
    where (elem->>'keyman_connect')::boolean = true;
  end if;

  if v_labels is null or array_length(v_labels, 1) is null then
    v_labels := array['キーマン再コール', 'アポ獲得', 'キーマン断り'];
  end if;

  return v_labels;
end;
$function$;

-- 個人別パフォーマンス集計（org 指定版）。perf_ranking() と本体ロジックは同一。
-- calls=架電件数 / keyman_connect=キーマン接続数 / appo=appointments(created_at)件数。
create or replace function public.perf_ranking_org(
  p_from timestamptz,
  p_to   timestamptz,
  p_org  uuid
)
returns table(getter_name text, calls integer, keyman_connect integer, appo integer, work_hours numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := p_org;
  v_cc  text[] := public._perf_keyman_connect_labels_org(p_org);
  v_idle_threshold_sec constant int := 1800;
begin
  return query
  with call_agg as (
    select
      cr.getter_name as gn,
      count(*)::int as cnt,
      count(*) filter (where cr.status = any(v_cc))::int as cc
    from public.call_records cr
    where cr.org_id = v_org
      and cr.called_at >= p_from and cr.called_at <= p_to
      and cr.getter_name is not null
    group by cr.getter_name
  ),
  appo_agg as (
    select
      a.getter_name as gn,
      count(*)::int as cnt
    from public.appointments a
    where a.org_id = v_org
      and a.created_at >= p_from and a.created_at <= p_to
      and a.getter_name is not null
    group by a.getter_name
  ),
  ordered_calls as (
    select
      cr.getter_name as gn,
      (cr.called_at at time zone 'Asia/Tokyo')::date as jst_date,
      cr.called_at,
      lag(cr.called_at) over (
        partition by cr.getter_name, (cr.called_at at time zone 'Asia/Tokyo')::date
        order by cr.called_at
      ) as prev_at
    from public.call_records cr
    where cr.org_id = v_org
      and cr.called_at >= p_from and cr.called_at <= p_to
      and cr.getter_name is not null
  ),
  daily_work as (
    select
      oc.gn,
      oc.jst_date,
      min(oc.called_at) as day_min,
      max(oc.called_at) as day_max,
      coalesce(sum(
        case
          when oc.prev_at is not null
           and extract(epoch from (oc.called_at - oc.prev_at)) > v_idle_threshold_sec
          then extract(epoch from (oc.called_at - oc.prev_at))
          else 0
        end
      ), 0) as gap_seconds
    from ordered_calls oc
    group by oc.gn, oc.jst_date
  ),
  work_hours_agg as (
    select
      dw.gn,
      round(sum(
        greatest(
          extract(epoch from (dw.day_max - dw.day_min)) - dw.gap_seconds,
          0
        ) / 3600.0
      )::numeric, 2) as wh
    from daily_work dw
    where dw.day_max > dw.day_min
    group by dw.gn
  )
  select
    coalesce(c.gn, a.gn, w.gn)::text,
    coalesce(c.cnt, 0)::int,
    coalesce(c.cc, 0)::int,
    coalesce(a.cnt, 0)::int,
    coalesce(w.wh, 0)::numeric
  from call_agg c
  full outer join appo_agg a on c.gn = a.gn
  full outer join work_hours_agg w on coalesce(c.gn, a.gn) = w.gn
  order by coalesce(c.cnt, 0) desc;
end;
$function$;

-- 当月「当社売上」個人別ランキング（org 指定版）。画面 SalesRanking.jsx / salesPeriod.js と同一定義:
--   面談実施日(meeting_date)が当月、status が 面談済/事前確認済/アポ取得、クライアント開拓リスト除外。
create or replace function public.notify_sales_ranking_org(p_org uuid, p_month text)
returns table(getter_name text, sales numeric, appo integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    a.getter_name::text,
    sum(coalesce(a.sales_amount, 0))::numeric as sales,
    count(*)::int as appo
  from public.appointments a
  left join public.call_lists cl on cl.id = a.list_id
  where a.org_id = p_org
    and a.getter_name is not null
    and a.status in ('面談済', '事前確認済', 'アポ取得')
    and coalesce(cl.is_prospecting, false) = false
    and to_char((a.meeting_date at time zone 'Asia/Tokyo')::date, 'YYYY-MM') = p_month
  group by a.getter_name
  having sum(coalesce(a.sales_amount, 0)) > 0
  order by sum(coalesce(a.sales_amount, 0)) desc;
$function$;

grant execute on function public._perf_keyman_connect_labels_org(uuid) to authenticated, service_role;
grant execute on function public.perf_ranking_org(timestamptz, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.notify_sales_ranking_org(uuid, text) to authenticated, service_role;
