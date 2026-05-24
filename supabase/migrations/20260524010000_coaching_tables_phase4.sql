-- ============================================================
-- Phase 4: 週次コーチング機能
-- ============================================================

-- 0) ヘルパ関数: 対象メンバーのチームリーダーかどうか判定
create or replace function is_team_leader_of(p_target_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from members reader
    join member_engagements me on me.member_id = reader.id
    join engagement_roles er on er.id = me.role_id
    join members target on target.id = p_target_member_id
    where reader.user_id = auth.uid()
      and er.name in ('リーダー', 'チームリーダー')
      and reader.team is not null
      and reader.team = target.team
  );
$$;

grant execute on function is_team_leader_of(uuid) to authenticated;

-- 1) coaching_comments  篠宮の手書きコメント
create table if not exists coaching_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  target_member_id uuid not null references members(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  comment_text text not null,
  themes text[] default '{}',
  author_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (target_member_id, period_start)
);

create index if not exists coaching_comments_target_period_idx
  on coaching_comments(target_member_id, period_start desc);

alter table coaching_comments enable row level security;

create policy "coaching_comments_select"
  on coaching_comments for select to authenticated
  using (
    is_admin()
    or target_member_id in (select id from members where user_id = auth.uid())
    or is_team_leader_of(target_member_id)
  );

create policy "coaching_comments_admin_write"
  on coaching_comments for all to authenticated
  using (is_admin())
  with check (is_admin());

create or replace function tg_set_updated_at_coaching_comments()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_coaching_comments_updated_at on coaching_comments;
create trigger trg_coaching_comments_updated_at
  before update on coaching_comments
  for each row execute function tg_set_updated_at_coaching_comments();

-- 2) member_kpi_snapshots  週次KPI集計 (cron で書き込み)
create table if not exists member_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null references members(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  calls int default 0,
  connects int default 0,
  appos int default 0,
  sales numeric default 0,
  connect_rate numeric,
  appo_rate numeric,
  created_at timestamptz default now(),
  unique (member_id, period_start)
);

create index if not exists member_kpi_snapshots_member_period_idx
  on member_kpi_snapshots(member_id, period_start desc);

alter table member_kpi_snapshots enable row level security;

create policy "member_kpi_snapshots_select"
  on member_kpi_snapshots for select to authenticated
  using (
    is_admin()
    or member_id in (select id from members where user_id = auth.uid())
    or is_team_leader_of(member_id)
  );

-- 3) coaching_action_items  チェックボックスTo-Do
create table if not exists coaching_action_items (
  id uuid primary key default gen_random_uuid(),
  coaching_comment_id uuid not null references coaching_comments(id) on delete cascade,
  text text not null,
  done bool default false,
  done_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists coaching_action_items_comment_idx
  on coaching_action_items(coaching_comment_id);

alter table coaching_action_items enable row level security;

create policy "coaching_action_items_select"
  on coaching_action_items for select to authenticated
  using (
    exists (select 1 from coaching_comments cc where cc.id = coaching_action_items.coaching_comment_id)
  );

create policy "coaching_action_items_admin_insert"
  on coaching_action_items for insert to authenticated
  with check (is_admin());

create policy "coaching_action_items_admin_delete"
  on coaching_action_items for delete to authenticated
  using (is_admin());

create policy "coaching_action_items_update"
  on coaching_action_items for update to authenticated
  using (
    is_admin()
    or exists (
      select 1 from coaching_comments cc
      join members m on m.id = cc.target_member_id
      where cc.id = coaching_action_items.coaching_comment_id
        and m.user_id = auth.uid()
    )
  );

-- 4) 再発検出 RPC
create or replace function get_recurring_themes(
  p_target_member_id uuid,
  p_weeks int default 3
) returns table(
  theme text,
  occurrence_count int,
  first_occurrence_period date,
  last_occurrence_period date
)
language sql stable security definer
set search_path = public, extensions
as $$
  with recent as (
    select unnest(themes) as theme, period_start
    from coaching_comments
    where target_member_id = p_target_member_id
      and period_start >= (current_date - (p_weeks * 7 + 7))
  )
  select
    theme,
    count(distinct period_start)::int as occurrence_count,
    min(period_start) as first_occurrence_period,
    max(period_start) as last_occurrence_period
  from recent
  group by theme
  having count(distinct period_start) >= p_weeks
  order by count(distinct period_start) desc, theme;
$$;

grant execute on function get_recurring_themes(uuid, int) to authenticated;

-- 5) 週次KPIスナップショット集計関数 + pg_cron
create or replace function snapshot_member_kpis_weekly()
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
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
    m.org_id, m.id, v_period_start, v_period_end,
    coalesce(cs.calls, 0),
    coalesce(cs.connects, 0),
    coalesce(ap.appos, 0),
    coalesce(ap.sales, 0),
    case when coalesce(cs.calls, 0) > 0 then round(coalesce(cs.connects, 0)::numeric / cs.calls * 100, 2) else 0 end,
    case when coalesce(cs.calls, 0) > 0 then round(coalesce(ap.appos, 0)::numeric / cs.calls * 100, 2) else 0 end
  from members m
  left join (
    select cr.getter_name,
      count(*) as calls,
      count(*) filter (where cr.status = any(v_keyman_labels)) as connects
    from call_records cr
    where cr.called_at >= v_period_start::timestamptz
      and cr.called_at < (v_period_end + interval '1 day')::timestamptz
    group by cr.getter_name
  ) cs on cs.getter_name = m.name
  left join (
    select a.getter_name,
      count(*) as appos,
      coalesce(sum(case when coalesce(cl.is_prospecting, false) = false then a.sales_amount else 0 end), 0) as sales
    from appointments a
    left join call_lists cl on cl.id = a.list_id
    where a.created_at >= v_period_start::timestamptz
      and a.created_at < (v_period_end + interval '1 day')::timestamptz
      and a.status in ('アポ取得', '事前確認済', '面談済')
    group by a.getter_name
  ) ap on ap.getter_name = m.name
  where m.is_active = true
  on conflict (member_id, period_start) do update
    set calls = excluded.calls,
        connects = excluded.connects,
        appos = excluded.appos,
        sales = excluded.sales,
        connect_rate = excluded.connect_rate,
        appo_rate = excluded.appo_rate;
end;
$$;

-- pg_cron はUTC基準。日曜21:00 UTC = 月曜06:00 JST
select cron.schedule(
  'member_kpi_weekly_snapshot',
  '0 21 * * SUN',
  $cron$ select public.snapshot_member_kpis_weekly(); $cron$
);
