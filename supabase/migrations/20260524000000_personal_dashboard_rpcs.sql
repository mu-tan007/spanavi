-- ============================================================
-- 個人視点ダッシュボード用 RPC（Phase 3: 数字分析）
-- ============================================================
-- ヒートマップは既存の perf_call_heatmap を流用するため、ここでは
-- 以下の 3 本を新規追加：
--   1. get_personal_funnel_compare  自分/チーム平均/組織TOP のファネル比較
--   2. get_personal_30d_trend       過去30日の日次推移（架電/接続/アポ）
--   3. get_personal_list_perf       リスト別パフォーマンス（接続率TOP/BOTTOM用）

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- 1) ファネル比較
-- ------------------------------------------------------------
create or replace function get_personal_funnel_compare(
  p_member_name text,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_team text;
  v_keyman_labels text[];
  v_result jsonb;
begin
  v_keyman_labels := _perf_keyman_connect_labels();
  select team into v_team from members where name = p_member_name limit 1;

  with mem_calls as (
    select
      cr.getter_name,
      count(*) as calls,
      count(*) filter (where cr.status = any(v_keyman_labels)) as connects
    from call_records cr
    where cr.called_at >= p_from and cr.called_at <= p_to
      and cr.getter_name is not null
    group by cr.getter_name
  ),
  mem_appos as (
    select a.getter_name, count(*) as appos
    from appointments a
    where a.created_at >= p_from and a.created_at <= p_to
      and a.status in ('アポ取得', '事前確認済', '面談済')
    group by a.getter_name
  ),
  combined as (
    select
      c.getter_name,
      c.calls,
      c.connects,
      coalesce(a.appos, 0) as appos,
      mb.team
    from mem_calls c
    left join mem_appos a on a.getter_name = c.getter_name
    left join members mb on mb.name = c.getter_name
  ),
  scopes as (
    -- 自分
    select 'self' as scope,
      coalesce(sum(calls), 0)::numeric as calls,
      coalesce(sum(connects), 0)::numeric as connects,
      coalesce(sum(appos), 0)::numeric as appos
    from combined where getter_name = p_member_name
    union all
    -- チーム平均（自分含む）
    select 'team_avg',
      coalesce(round(avg(calls), 1), 0),
      coalesce(round(avg(connects), 1), 0),
      coalesce(round(avg(appos), 1), 0)
    from combined where team = v_team
    union all
    -- 組織TOP（メンバー単位の max）
    select 'org_top',
      coalesce(max(calls), 0),
      coalesce(max(connects), 0),
      coalesce(max(appos), 0)
    from combined
  )
  select jsonb_object_agg(
    scope,
    jsonb_build_object(
      'calls', calls,
      'connects', connects,
      'appos', appos,
      'connect_rate', case when calls > 0 then round(connects / calls * 100, 1) else 0 end,
      'appo_rate', case when calls > 0 then round(appos / calls * 100, 2) else 0 end,
      'connect_to_appo_rate', case when connects > 0 then round(appos / connects * 100, 1) else 0 end
    )
  )
  into v_result
  from scopes;

  return v_result;
end;
$$;

grant execute on function get_personal_funnel_compare(text, timestamptz, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- 2) 30日推移（日次）
-- ------------------------------------------------------------
create or replace function get_personal_30d_trend(
  p_member_name text
) returns table(
  day date,
  calls bigint,
  connects bigint,
  appos bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_keyman_labels text[];
begin
  v_keyman_labels := _perf_keyman_connect_labels();

  return query
  with date_series as (
    select generate_series(
      (current_date - interval '29 days')::date,
      current_date::date,
      '1 day'::interval
    )::date as d
  ),
  call_stats as (
    select
      ((cr.called_at at time zone 'Asia/Tokyo')::date) as d,
      count(*) as calls,
      count(*) filter (where cr.status = any(v_keyman_labels)) as connects
    from call_records cr
    where cr.getter_name = p_member_name
      and cr.called_at >= (current_date - interval '29 days')
    group by 1
  ),
  appo_stats as (
    select
      ((a.created_at at time zone 'Asia/Tokyo')::date) as d,
      count(*) as appos
    from appointments a
    where a.getter_name = p_member_name
      and a.created_at >= (current_date - interval '29 days')
      and a.status in ('アポ取得', '事前確認済', '面談済')
    group by 1
  )
  select
    ds.d as day,
    coalesce(c.calls, 0) as calls,
    coalesce(c.connects, 0) as connects,
    coalesce(ap.appos, 0) as appos
  from date_series ds
  left join call_stats c on c.d = ds.d
  left join appo_stats ap on ap.d = ds.d
  order by ds.d;
end;
$$;

grant execute on function get_personal_30d_trend(text) to authenticated;

-- ------------------------------------------------------------
-- 3) リスト別パフォーマンス（接続率TOP/BOTTOM用）
-- ------------------------------------------------------------
-- 最低10件以上架電したリストのみ返す（ノイズ排除）。
-- フロント側で connect_rate 降順で TOP3 / BOTTOM3 を抜き取る。
create or replace function get_personal_list_perf(
  p_member_name text,
  p_from timestamptz,
  p_to timestamptz
) returns table(
  list_id uuid,
  list_name text,
  industry text,
  calls bigint,
  connects bigint,
  appos bigint,
  connect_rate numeric,
  appo_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_keyman_labels text[];
begin
  v_keyman_labels := _perf_keyman_connect_labels();

  return query
  with stats as (
    select
      cr.list_id,
      count(*) as calls,
      count(*) filter (where cr.status = any(v_keyman_labels)) as connects
    from call_records cr
    where cr.getter_name = p_member_name
      and cr.called_at >= p_from and cr.called_at <= p_to
      and cr.list_id is not null
    group by cr.list_id
  ),
  appo_stats as (
    select
      a.list_id,
      count(*) as appos
    from appointments a
    where a.getter_name = p_member_name
      and a.created_at >= p_from and a.created_at <= p_to
      and a.status in ('アポ取得', '事前確認済', '面談済')
      and a.list_id is not null
    group by a.list_id
  )
  select
    s.list_id,
    cl.name as list_name,
    cl.industry,
    s.calls,
    s.connects,
    coalesce(ap.appos, 0) as appos,
    case when s.calls > 0 then round(s.connects::numeric / s.calls * 100, 1) else 0 end as connect_rate,
    case when s.calls > 0 then round(coalesce(ap.appos, 0)::numeric / s.calls * 100, 2) else 0 end as appo_rate
  from stats s
  left join call_lists cl on cl.id = s.list_id
  left join appo_stats ap on ap.list_id = s.list_id
  where s.calls >= 10
  order by connect_rate desc;
end;
$$;

grant execute on function get_personal_list_perf(text, timestamptz, timestamptz) to authenticated;
