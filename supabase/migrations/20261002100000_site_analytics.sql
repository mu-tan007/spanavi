set lock_timeout = '5s';
-- 全社 > サイト分析（ma-sp.co の Search Console と GA4 を日別で持つ）。
-- 書き込みは Edge Function sync-site-analytics（service role）だけ。読めるのは管理者だけ。

create table if not exists public.site_metrics_daily (
  org_id uuid not null default 'a0000000-0000-0000-0000-000000000001' references public.organizations(id),
  site text not null,
  date date not null,
  -- Search Console（Google 検索）
  gsc_clicks integer,
  gsc_impressions integer,
  gsc_ctr numeric,
  gsc_position numeric,
  -- GA4（サイト全体）
  ga_users integer,
  ga_new_users integer,
  ga_sessions integer,
  ga_page_views integer,
  ga_engaged_sessions integer,
  ga_avg_session_sec numeric,
  updated_at timestamptz not null default now(),
  primary key (site, date)
);

-- 日別の内訳。kind: query（検索語句）/ page（検索で出たページ）/ channel（流入元）/ ga_page（閲覧ページ）
create table if not exists public.site_metrics_breakdown (
  org_id uuid not null default 'a0000000-0000-0000-0000-000000000001' references public.organizations(id),
  site text not null,
  date date not null,
  kind text not null check (kind in ('query', 'page', 'channel', 'ga_page')),
  key text not null,
  clicks integer,
  impressions integer,
  position numeric,
  sessions integer,
  users integer,
  page_views integer,
  updated_at timestamptz not null default now(),
  primary key (site, date, kind, key)
);

alter table public.site_metrics_daily enable row level security;
alter table public.site_metrics_breakdown enable row level security;

drop policy if exists site_metrics_daily_admin_read on public.site_metrics_daily;
create policy site_metrics_daily_admin_read on public.site_metrics_daily
  for select to authenticated
  using (public.is_org_admin() and org_id = public.get_user_org_id());

drop policy if exists site_metrics_breakdown_admin_read on public.site_metrics_breakdown;
create policy site_metrics_breakdown_admin_read on public.site_metrics_breakdown
  for select to authenticated
  using (public.is_org_admin() and org_id = public.get_user_org_id());

-- 毎朝 6:10（日本時間）に直近の数字を取り直す。Search Console は2〜3日遅れて確定するため、
-- 関数側で直近10日分を毎回上書きする。
select cron.unschedule('sync-site-analytics')
 where exists (select 1 from cron.job where jobname = 'sync-site-analytics');

select cron.schedule(
  'sync-site-analytics',
  '10 21 * * *',
  $cron$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/sync-site-analytics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

-- 期間内の内訳を合計して上位だけ返す（画面用）。RLS を効かせるため security invoker。
create or replace function public.site_breakdown_summary(p_site text, p_kind text, p_start date, p_end date, p_limit int default 20)
returns table (key text, clicks bigint, impressions bigint, avg_position numeric, sessions bigint, users bigint, page_views bigint)
language sql stable security invoker set search_path = public
as $$
  select b.key,
         sum(b.clicks)::bigint,
         sum(b.impressions)::bigint,
         -- 平均掲載順位は表示回数で重み付け
         case when sum(b.impressions) > 0 then sum(b.position * b.impressions) / sum(b.impressions) end,
         sum(b.sessions)::bigint,
         sum(b.users)::bigint,
         sum(b.page_views)::bigint
    from public.site_metrics_breakdown b
   where b.site = p_site and b.kind = p_kind and b.date between p_start and p_end
   group by b.key
   order by coalesce(sum(b.impressions), 0) + coalesce(sum(b.sessions), 0) + coalesce(sum(b.page_views), 0) desc
   limit p_limit;
$$;
grant execute on function public.site_breakdown_summary(text, text, date, date, int) to authenticated;
