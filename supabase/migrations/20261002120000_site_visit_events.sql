-- フォーム営業・メールで送ったコーポレートサイトのリンク（https://ma-sp.co/?t=<token>）の閲覧計測。
-- token は doc_sends と同じ（1社1トークン）。サイト側の小さなスクリプトが、その訪問の各ページを
-- Edge Function site-visit に送る。資料の閲覧（doc_view_events）とは別に持つ。
set lock_timeout = '3s';

alter table public.doc_sends add column if not exists site_notified_at timestamptz;
comment on column public.doc_sends.site_notified_at is '初回のサイト閲覧を Slack #contact に知らせた時刻。site-visit が原子的に取り合って二重通知を防ぐ';

create table if not exists public.site_visit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  client_id uuid not null,
  send_id uuid not null references public.doc_sends(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  session_id text,
  path text,
  referrer text,
  user_agent text,
  ip_hash text,
  is_bot boolean not null default false
);
create index if not exists site_visit_events_send_idx on public.site_visit_events (send_id, occurred_at);

alter table public.site_visit_events enable row level security;

drop policy if exists site_visit_events_select_own_org on public.site_visit_events;
create policy site_visit_events_select_own_org on public.site_visit_events for select to authenticated
  using (org_id = get_user_org_id());
drop policy if exists site_visit_events_select_client on public.site_visit_events;
create policy site_visit_events_select_client on public.site_visit_events for select
  using (is_client_user() and client_id = current_client_id() and org_id = current_client_org_id());

-- 集計はこの1本（列は末尾に足す。create or replace view は途中に挟めない）
create or replace view public.doc_send_stats with (security_invoker = true) as
select
  s.id, s.org_id, s.client_id, s.campaign, s.token, s.lead_item_id, s.company, s.tel,
  s.channel, s.sent_to, s.doc_key, s.sent_at, s.view_notified_at, s.note, s.created_at,
  e.first_view_at, e.last_view_at, coalesce(e.view_count, 0) as view_count,
  c.call_status, c.call_called_at, c.call_memo, c.caller_name,
  coalesce(c.call_count, 0) as call_count,
  w.first_site_at, w.last_site_at, coalesce(w.site_page_views, 0) as site_page_views,
  coalesce(w.site_visits, 0) as site_visits, w.site_paths
from public.doc_sends s
left join lateral (
  select min(v.occurred_at) as first_view_at, max(v.occurred_at) as last_view_at, count(*) as view_count
  from public.doc_view_events v
  where v.send_id = s.id and not v.is_bot
) e on true
left join lateral (
  select r.status as call_status, r.called_at as call_called_at, r.memo as call_memo,
         m.name as caller_name,
         (select count(*) from public.call_records r2 where r2.item_id = s.lead_item_id) as call_count
  from public.call_records r
  left join public.members m on m.user_id = r.caller_id
  where r.item_id = s.lead_item_id
  order by r.called_at desc nulls last
  limit 1
) c on true
left join lateral (
  -- 見たページは閲覧数の多い順に並べる
  select min(x.occurred_at) as first_site_at, max(x.occurred_at) as last_site_at,
         count(*) as site_page_views, count(distinct x.session_id) as site_visits,
         (select array_agg(p.path order by p.n desc, p.path)
            from (select y.path, count(*) as n from public.site_visit_events y
                   where y.send_id = s.id and not y.is_bot group by y.path) p) as site_paths
  from public.site_visit_events x
  where x.send_id = s.id and not x.is_bot
) w on true;

grant select on public.doc_send_stats to authenticated;
