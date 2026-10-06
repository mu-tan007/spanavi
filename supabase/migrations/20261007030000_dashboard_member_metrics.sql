-- ダッシュボード「結果を出す行動」と順位表のための、人ごとの集計（2026-10-07）
-- 上位と中位の差の分析（3〜9月）で差が分かれた行動を、期間を指定して人ごとに出す。
-- 1か月分で約0.2秒。上位・中位の目安は毎晩まとめて計算して dashboard_benchmarks に置く。

create or replace function public._dash_member_metrics(p_org uuid, p_from timestamptz, p_to timestamptz)
returns table(
  getter_name text,
  calls int, keyman int, appo int, days int, lists int,
  recall50_pct numeric,          -- 1日の最初の50件のうち、直前の結果が受付再コール・キーマン再コールだった会社へのかけ直し
  start_first_med_min numeric,   -- シフト開始から最初の架電まで（分・中央値。シフトより2時間以上前の架電は除く）
  offshift_pct numeric,          -- 架電した日のうち、シフトのない日
  span_med_h numeric,            -- 1日の最初〜最後の架電（時間・中央値）
  max_consec_weekdays int,       -- 平日に続けて架電した最長日数（週末はとばす）
  talk_med_sec numeric,          -- キーマン断り・キーマン再コールの通話の長さ（秒・中央値。文字起こし済みのみ）
  talk_n int,
  mtg_attended int, mtg_total int -- 週次MTG 直近8回の出席
)
language sql stable
set search_path = public
as $$
with r as (
  select cr.getter_name n, cr.item_id, cr.list_id, cr.status, cr.called_at, cr.transcript_seconds ts,
         (cr.called_at at time zone 'Asia/Tokyo') lt,
         (cr.called_at at time zone 'Asia/Tokyo')::date d,
         row_number() over (partition by cr.getter_name, (cr.called_at at time zone 'Asia/Tokyo')::date order by cr.called_at) rn
  from call_records cr
  where cr.org_id = p_org and cr.called_at >= p_from and cr.called_at < p_to
    and cr.status <> '除外' and coalesce(cr.getter_name, '') <> ''
),
f50 as (
  select r.n,
         (select p.status from call_records p
           where p.item_id = r.item_id and p.called_at < r.called_at
           order by p.called_at desc limit 1) prev
  from r where r.rn <= 50 and r.item_id is not null
),
f50a as (
  select n, count(*) t, count(*) filter (where prev in ('受付再コール', 'キーマン再コール')) rc from f50 group by n
),
dd as (select n, d, min(lt) fc, max(lt) lc from r group by n, d),
sh as (
  select s.member_name n, s.shift_date d, min(s.start_time) st
  from shifts s
  where s.org_id = p_org
    and s.shift_date between (p_from at time zone 'Asia/Tokyo')::date and (p_to at time zone 'Asia/Tokyo')::date
  group by 1, 2
),
dsh as (select dd.*, sh.st from dd left join sh on sh.n = dd.n and sh.d = dd.d),
dagg as (
  select n,
    percentile_cont(0.5) within group (order by extract(epoch from (fc - (d + st))) / 60)
      filter (where st is not null and fc >= d + st - interval '2 hours') sf,
    count(*) filter (where st is null)::numeric / nullif(count(*), 0) * 100 offp,
    percentile_cont(0.5) within group (order by extract(epoch from (lc - fc)) / 3600) span
  from dsh group by n
),
-- 平日の通し番号（2000-01-03 は月曜）。金→月も 1 つ違いになる
wd as (select distinct n, d, (d - date '2000-01-03') k from r where extract(isodow from d) < 6),
wdn as (select n, (k / 7) * 5 + (k % 7) wix from wd),
grp as (select n, wix - row_number() over (partition by n order by wix) g from wdn),
consec as (select n, max(c) mx from (select n, g, count(*) c from grp group by n, g) x group by n),
talk as (
  select n, percentile_cont(0.5) within group (order by ts) med, count(*) cnt
  from r where status in ('キーマン断り', 'キーマン再コール') and ts is not null group by n
),
mv as (select id from weekly_meeting_videos where org_id = p_org order by meeting_date desc limit 8),
mtg as (
  select m.name n, count(distinct w.video_id) att
  from members m
  join weekly_meeting_viewers w on w.member_id = m.id and w.reason = 'attended'
  join mv on mv.id = w.video_id
  where m.org_id = p_org
  group by m.name
),
base as (
  select n,
    count(*)::int calls,
    count(*) filter (where status = any(_perf_keyman_connect_labels()))::int keyman,
    count(*) filter (where status = 'アポ獲得')::int appo,
    count(distinct d)::int days,
    count(distinct list_id)::int lists
  from r group by n
)
select b.n, b.calls, b.keyman, b.appo, b.days, b.lists,
  round(100.0 * f.rc / nullif(f.t, 0), 1),
  round(da.sf::numeric, 1),
  round(da.offp, 1),
  round(da.span::numeric, 2),
  coalesce(c.mx, 0)::int,
  round(t.med::numeric, 0),
  coalesce(t.cnt, 0)::int,
  coalesce(mt.att, 0)::int,
  (select count(*) from mv)::int
from base b
left join f50a f on f.n = b.n
left join dagg da on da.n = b.n
left join consec c on c.n = b.n
left join talk t on t.n = b.n
left join mtg mt on mt.n = b.n;
$$;

revoke all on function public._dash_member_metrics(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 画面から呼ぶ入口。自分の会社だけ。期間は最大93日。
drop function if exists public.dashboard_member_metrics(timestamptz, timestamptz);

create function public.dashboard_member_metrics(p_from timestamptz, p_to timestamptz)
returns table(
  getter_name text, calls int, keyman int, appo int, days int, lists int,
  recall50_pct numeric, start_first_med_min numeric, offshift_pct numeric, span_med_h numeric,
  max_consec_weekdays int, talk_med_sec numeric, talk_n int, mtg_attended int, mtg_total int
)
language sql stable security definer
set search_path = public
as $$
  select * from _dash_member_metrics(
    get_user_org_id(),
    greatest(p_from, p_to - interval '93 days'),
    p_to
  )
  where get_user_org_id() is not null;
$$;

revoke all on function public.dashboard_member_metrics(timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_member_metrics(timestamptz, timestamptz) to authenticated;

-- 上位・中位の目安。分析（3〜9月）と同じく「人月」で出す：
-- 直近3か月（今月を除く完了月）を月ごとに区切り、各月のアポ数上位4名＝上位、それ以外で月500件以上＝中位。
create table if not exists public.dashboard_benchmarks (
  org_id uuid primary key,
  computed_at timestamptz not null default now(),
  window_from timestamptz not null,
  window_to timestamptz not null,
  weekdays int not null,
  top jsonb not null,
  mid jsonb not null,
  top_names text[] not null default '{}',
  mid_count int not null default 0
);
alter table public.dashboard_benchmarks enable row level security;
drop policy if exists dashboard_benchmarks_select_same_org on public.dashboard_benchmarks;
create policy dashboard_benchmarks_select_same_org on public.dashboard_benchmarks
  for select to authenticated using (org_id = (select public.get_user_org_id()));

create or replace function public.refresh_dashboard_benchmarks()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  o uuid;
  v_month date := date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;  -- 今月の1日
  v_first date := (v_month - interval '3 months')::date;
  mo date;
begin
  for o in select distinct cr.org_id from call_records cr
           where cr.called_at >= (v_first::timestamp at time zone 'Asia/Tokyo') and cr.org_id is not null loop

    create temp table if not exists _dash_pm (
      mo date, getter_name text, calls int, keyman int, appo int, days int, lists int,
      recall50_pct numeric, start_first_med_min numeric, offshift_pct numeric, span_med_h numeric,
      max_consec_weekdays int, talk_med_sec numeric, talk_n int, mtg_attended int, mtg_total int, weekdays int
    ) on commit drop;
    delete from _dash_pm;

    for mo in select generate_series(v_first, v_month - interval '1 month', interval '1 month')::date loop
      insert into _dash_pm
      select mo, x.*,
        (select count(*) from generate_series(mo, (mo + interval '1 month' - interval '1 day')::date, interval '1 day') g where extract(isodow from g) < 6)::int
      from _dash_member_metrics(o, mo::timestamp at time zone 'Asia/Tokyo', (mo + interval '1 month')::timestamp at time zone 'Asia/Tokyo') x
      -- 受講生と役員（代表取締役など）は目安の計算に入れない
      where x.getter_name not in (select mm.name from members mm where mm.org_id = o and mm.name is not null
                                  and (mm.rank = 'student' or coalesce(mm.position, '') like '%取締役%'));
    end loop;

    insert into dashboard_benchmarks as b (org_id, computed_at, window_from, window_to, weekdays, top, mid, top_names, mid_count)
    select o, now(), v_first::timestamp at time zone 'Asia/Tokyo', v_month::timestamp at time zone 'Asia/Tokyo', 0,
           agg.top, agg.mid, agg.names, agg.midc
    from (
      with ranked as (select p.*, row_number() over (partition by p.mo order by p.appo desc, p.calls desc) rk from _dash_pm p),
      grp as (
        select case when rk <= 4 and appo > 0 then 'top' when calls >= 500 then 'mid' end g, ranked.*
        from ranked
      ),
      a as (
        select g,
          jsonb_build_object(
            'days_pct', round(avg(days::numeric / nullif(weekdays, 0) * 100), 1),
            'max_consec_weekdays', round(avg(max_consec_weekdays)::numeric, 1),
            'offshift_pct', round(avg(offshift_pct), 1),
            'start_first_med_min', round(avg(start_first_med_min), 1),
            'span_med_h', round(avg(span_med_h), 2),
            'recall50_pct', round(avg(recall50_pct), 1),
            'lists_per_month', round(avg(lists)::numeric, 1),
            'keyman_appo_pct', round(sum(appo)::numeric / nullif(sum(keyman), 0) * 100, 1),
            'talk_med_sec', round(avg(talk_med_sec) filter (where talk_n >= 5), 0),
            'mtg_pct', round(avg(mtg_attended::numeric / nullif(mtg_total, 0) * 100), 1),
            'n', count(*)
          ) j,
          array_agg(distinct getter_name) names,
          count(*) c
        from grp where g is not null group by g
      )
      select
        coalesce((select j from a where g = 'top'), '{}'::jsonb) top,
        coalesce((select j from a where g = 'mid'), '{}'::jsonb) mid,
        coalesce((select names from a where g = 'top'), '{}') names,
        coalesce((select c from a where g = 'mid'), 0)::int midc
    ) agg
    on conflict (org_id) do update set
      computed_at = excluded.computed_at, window_from = excluded.window_from, window_to = excluded.window_to,
      weekdays = excluded.weekdays, top = excluded.top, mid = excluded.mid,
      top_names = excluded.top_names, mid_count = excluded.mid_count;
  end loop;
end;
$$;

revoke all on function public.refresh_dashboard_benchmarks() from public, anon, authenticated;

-- 毎晩 4:10（日本時間）に計算し直す。18:40 UTC 台の重い集計と重ねない
select cron.unschedule('dashboard-benchmarks-nightly') where exists (select 1 from cron.job where jobname = 'dashboard-benchmarks-nightly');
select cron.schedule('dashboard-benchmarks-nightly', '10 19 * * *', $$SET statement_timeout='5min'; SELECT public.refresh_dashboard_benchmarks();$$);
