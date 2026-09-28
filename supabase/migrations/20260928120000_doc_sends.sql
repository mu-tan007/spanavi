-- フォーム営業で送る資料リンクの閲覧計測（設計: tasks/sekkei_form_eigyo_doc_tracking.md）
-- 会社ごとに https://spanavi.jp/d/<token> を発行し、開かれたら doc_view_events に残す。
-- ギフトDM（gift_*）とは分けて持つ。notify-gift-scan が org 全体を拾うため、相乗りすると
-- Renga様の文言でフォーム営業の会社が流れてしまう。
set lock_timeout = '3s';

create table if not exists public.doc_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  client_id uuid not null references public.clients(id),
  campaign text not null,
  token text not null unique check (token ~ '^[0-9a-f]{8}$'),
  lead_item_id uuid not null references public.call_list_items(id) on delete cascade,
  company text not null,
  tel text,
  channel text not null check (channel in ('form', 'email')),
  sent_to text,
  doc_key text not null,
  sent_at timestamptz,
  view_notified_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (campaign, lead_item_id)
);
comment on table public.doc_sends is 'フォーム営業・メールで送った資料リンク。1社1トークン。sent_at が null はリンク発行済み・未送付';
comment on column public.doc_sends.view_notified_at is '初回閲覧を Slack #contact に知らせた時刻。doc-view が原子的に取り合って二重通知を防ぐ';

create index if not exists doc_sends_client_idx on public.doc_sends (client_id);
create index if not exists doc_sends_lead_idx on public.doc_sends (lead_item_id);

create table if not exists public.doc_view_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  client_id uuid not null,
  send_id uuid not null references public.doc_sends(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  user_agent text,
  ip_hash text,
  is_bot boolean not null default false,
  raw jsonb
);
create index if not exists doc_view_events_send_idx on public.doc_view_events (send_id, occurred_at);

alter table public.doc_sends enable row level security;
alter table public.doc_view_events enable row level security;

drop policy if exists doc_sends_select_own_org on public.doc_sends;
create policy doc_sends_select_own_org on public.doc_sends for select to authenticated
  using (org_id = get_user_org_id());
drop policy if exists doc_sends_insert_own_org on public.doc_sends;
create policy doc_sends_insert_own_org on public.doc_sends for insert to authenticated
  with check (org_id = get_user_org_id());
drop policy if exists doc_sends_update_own_org on public.doc_sends;
create policy doc_sends_update_own_org on public.doc_sends for update to authenticated
  using (org_id = get_user_org_id());
drop policy if exists doc_sends_select_client on public.doc_sends;
create policy doc_sends_select_client on public.doc_sends for select
  using (is_client_user() and client_id = current_client_id() and org_id = current_client_org_id());

drop policy if exists doc_view_events_select_own_org on public.doc_view_events;
create policy doc_view_events_select_own_org on public.doc_view_events for select to authenticated
  using (org_id = get_user_org_id());
drop policy if exists doc_view_events_select_client on public.doc_view_events;
create policy doc_view_events_select_client on public.doc_view_events for select
  using (is_client_user() and client_id = current_client_id() and org_id = current_client_org_id());

-- 集計はこの1本。画面では数えない（gift_shipment_stats と同じ形）
create or replace view public.doc_send_stats with (security_invoker = true) as
select
  s.id, s.org_id, s.client_id, s.campaign, s.token, s.lead_item_id, s.company, s.tel,
  s.channel, s.sent_to, s.doc_key, s.sent_at, s.view_notified_at, s.note, s.created_at,
  e.first_view_at, e.last_view_at, coalesce(e.view_count, 0) as view_count,
  c.call_status, c.call_called_at, c.call_memo, c.caller_name,
  coalesce(c.call_count, 0) as call_count
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
) c on true;

grant select on public.doc_send_stats to authenticated;
