-- メルマガ機能 (Email Marketing)
-- 配信対象: clients.status セグメント + client_lead_companies (見込み客)
-- 配信基盤: Resend API (newsletter@ma-sp.co)
-- 機能: テンプレ管理, キャンペーン作成, 配信履歴, 開封/クリックトラッキング, オプトアウト管理

set local search_path = public, extensions;

-- ============================================================
-- 1. email_templates: 再利用可能なHTMLメルマガテンプレ
-- ============================================================
create table if not exists public.email_templates (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  subject_template text not null,
  body_html        text not null,
  body_text        text,
  from_name        text default 'M&Aソーシングパートナーズ',
  blocks           jsonb,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists email_templates_org_idx
  on public.email_templates (org_id, updated_at desc);

-- ============================================================
-- 2. email_campaigns: 配信キャンペーン本体
-- ============================================================
create table if not exists public.email_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  template_id        uuid references public.email_templates(id) on delete set null,
  name               text not null,
  subject            text not null,
  from_email         text not null default 'newsletter@ma-sp.co',
  from_name          text not null default 'M&Aソーシングパートナーズ',
  body_html          text not null,
  body_text          text,
  segment_definition jsonb not null default '{}'::jsonb,
  status             text not null default 'draft'
                       check (status in ('draft','scheduled','sending','sent','canceled','failed')),
  scheduled_at       timestamptz,
  sent_at            timestamptz,
  total_recipients   integer default 0,
  sent_count         integer default 0,
  bounced_count      integer default 0,
  opened_count       integer default 0,
  clicked_count      integer default 0,
  unsubscribed_count integer default 0,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists email_campaigns_org_status_idx
  on public.email_campaigns (org_id, status, scheduled_at);

-- ============================================================
-- 3. email_campaign_recipients: 配信対象スナップショット
-- ============================================================
create table if not exists public.email_campaign_recipients (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.email_campaigns(id) on delete cascade,
  org_id            uuid not null,
  recipient_type    text not null
                      check (recipient_type in ('client_contact','lead_company','manual')),
  client_id         uuid,
  client_contact_id uuid,
  lead_company_id   uuid,
  email             text not null,
  display_name      text,
  merge_vars        jsonb default '{}'::jsonb,
  resend_message_id text,
  status            text not null default 'queued'
                      check (status in ('queued','sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed')),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  first_opened_at   timestamptz,
  first_clicked_at  timestamptz,
  error_message     text,
  unsubscribe_token text unique,
  created_at        timestamptz not null default now()
);

create index if not exists ecr_campaign_status_idx
  on public.email_campaign_recipients (campaign_id, status);
create index if not exists ecr_email_idx
  on public.email_campaign_recipients (email);
create index if not exists ecr_resend_msg_idx
  on public.email_campaign_recipients (resend_message_id);

-- ============================================================
-- 4. email_events: Resend Webhook 生イベント
-- ============================================================
create table if not exists public.email_events (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references public.email_campaign_recipients(id) on delete cascade,
  org_id          uuid not null,
  event_type      text not null
                    check (event_type in ('sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed')),
  occurred_at     timestamptz not null default now(),
  clicked_url     text,
  user_agent      text,
  ip_hash         text,
  raw_payload     jsonb,
  resend_event_id text unique,
  created_at      timestamptz not null default now()
);

create index if not exists email_events_recipient_idx
  on public.email_events (recipient_id, occurred_at);
create index if not exists email_events_org_type_idx
  on public.email_events (org_id, event_type, occurred_at desc);

-- ============================================================
-- 5. email_unsubscribes: オプトアウト管理
-- ============================================================
create table if not exists public.email_unsubscribes (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  email               text not null,
  scope               text not null default 'global'
                        check (scope in ('global','engagement')),
  engagement_id       uuid references public.engagements(id) on delete cascade,
  unsubscribed_at     timestamptz not null default now(),
  source              text check (source in ('link','manual','bounce','complaint')),
  source_recipient_id uuid references public.email_campaign_recipients(id) on delete set null,
  note                text,
  created_at          timestamptz not null default now()
);

-- scope='global' は (org_id, email) で一意 / 'engagement' は (org_id, email, engagement_id) で一意
create unique index if not exists email_unsubscribes_global_uniq
  on public.email_unsubscribes (org_id, email) where scope = 'global';
create unique index if not exists email_unsubscribes_engagement_uniq
  on public.email_unsubscribes (org_id, email, engagement_id) where scope = 'engagement';
create index if not exists email_unsubscribes_lookup_idx
  on public.email_unsubscribes (org_id, email);

-- ============================================================
-- 6. updated_at 自動更新トリガ
-- ============================================================
create or replace function public.tg_email_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_email_templates_updated_at on public.email_templates;
create trigger trg_email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.tg_email_set_updated_at();

drop trigger if exists trg_email_campaigns_updated_at on public.email_campaigns;
create trigger trg_email_campaigns_updated_at
  before update on public.email_campaigns
  for each row execute function public.tg_email_set_updated_at();

-- ============================================================
-- 7. ハードバウンス・苦情を自動でグローバルオプトアウトに反映
-- ============================================================
create or replace function public.tg_email_event_auto_unsubscribe() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text;
begin
  if new.event_type not in ('bounced','complained') then
    return new;
  end if;
  select email into v_email
    from public.email_campaign_recipients
    where id = new.recipient_id;
  if v_email is null then
    return new;
  end if;
  insert into public.email_unsubscribes (org_id, email, scope, source, source_recipient_id)
    values (new.org_id, v_email, 'global',
            case when new.event_type = 'bounced' then 'bounce' else 'complaint' end,
            new.recipient_id)
    on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_email_event_auto_unsubscribe on public.email_events;
create trigger trg_email_event_auto_unsubscribe
  after insert on public.email_events
  for each row execute function public.tg_email_event_auto_unsubscribe();

-- ============================================================
-- 8. キャンペーン集計カウンタの自動更新
-- ============================================================
create or replace function public.tg_email_event_update_campaign_counters() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id
    from public.email_campaign_recipients
    where id = new.recipient_id;
  if v_campaign_id is null then
    return new;
  end if;

  -- 同一recipient + 同一event_typeは1回だけカウント（重複webhook対策）
  if new.event_type = 'opened' then
    update public.email_campaigns
      set opened_count = (
        select count(distinct r.id)
          from public.email_campaign_recipients r
          join public.email_events e on e.recipient_id = r.id
          where r.campaign_id = v_campaign_id and e.event_type = 'opened'
      )
      where id = v_campaign_id;
  elsif new.event_type = 'clicked' then
    update public.email_campaigns
      set clicked_count = (
        select count(distinct r.id)
          from public.email_campaign_recipients r
          join public.email_events e on e.recipient_id = r.id
          where r.campaign_id = v_campaign_id and e.event_type = 'clicked'
      )
      where id = v_campaign_id;
  elsif new.event_type = 'bounced' then
    update public.email_campaigns
      set bounced_count = (
        select count(distinct r.id)
          from public.email_campaign_recipients r
          join public.email_events e on e.recipient_id = r.id
          where r.campaign_id = v_campaign_id and e.event_type = 'bounced'
      )
      where id = v_campaign_id;
  elsif new.event_type = 'unsubscribed' then
    update public.email_campaigns
      set unsubscribed_count = unsubscribed_count + 1
      where id = v_campaign_id;
  end if;

  return new;
end $$;

drop trigger if exists trg_email_event_update_counters on public.email_events;
create trigger trg_email_event_update_counters
  after insert on public.email_events
  for each row execute function public.tg_email_event_update_campaign_counters();

-- ============================================================
-- 9. recipients の status は「より進んだ状態にしか上書きしない」
-- ============================================================
-- 状態順: queued(0) < sent(1) < delivered(2) < opened(3) < clicked(4) < bounced/complained/unsubscribed/failed(5)
create or replace function public.tg_email_recipient_status_progression() returns trigger
language plpgsql as $$
declare
  v_old_rank int;
  v_new_rank int;
begin
  v_old_rank := case old.status
    when 'queued' then 0
    when 'sent' then 1
    when 'delivered' then 2
    when 'opened' then 3
    when 'clicked' then 4
    else 5
  end;
  v_new_rank := case new.status
    when 'queued' then 0
    when 'sent' then 1
    when 'delivered' then 2
    when 'opened' then 3
    when 'clicked' then 4
    else 5
  end;
  -- bounced/complained/failed等(rank=5)は常に許可、それ以外は前進のみ
  if v_new_rank < v_old_rank and v_new_rank < 5 then
    new.status := old.status;
  end if;
  return new;
end $$;

drop trigger if exists trg_email_recipient_status_progression on public.email_campaign_recipients;
create trigger trg_email_recipient_status_progression
  before update of status on public.email_campaign_recipients
  for each row execute function public.tg_email_recipient_status_progression();

-- ============================================================
-- 10. RLS (全テーブル、既存clientsと同パターン: org_id = get_user_org_id())
-- ============================================================
alter table public.email_templates           enable row level security;
alter table public.email_campaigns           enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_events              enable row level security;
alter table public.email_unsubscribes        enable row level security;

create policy email_templates_select_own_org on public.email_templates for select to authenticated
  using (org_id = public.get_user_org_id());
create policy email_templates_insert_own_org on public.email_templates for insert to authenticated
  with check (org_id = public.get_user_org_id());
create policy email_templates_update_own_org on public.email_templates for update to authenticated
  using (org_id = public.get_user_org_id());
create policy email_templates_delete_own_org on public.email_templates for delete to authenticated
  using (org_id = public.get_user_org_id());

create policy email_campaigns_select_own_org on public.email_campaigns for select to authenticated
  using (org_id = public.get_user_org_id());
create policy email_campaigns_insert_own_org on public.email_campaigns for insert to authenticated
  with check (org_id = public.get_user_org_id());
create policy email_campaigns_update_own_org on public.email_campaigns for update to authenticated
  using (org_id = public.get_user_org_id());
create policy email_campaigns_delete_own_org on public.email_campaigns for delete to authenticated
  using (org_id = public.get_user_org_id());

create policy email_campaign_recipients_select_own_org on public.email_campaign_recipients for select to authenticated
  using (org_id = public.get_user_org_id());
create policy email_campaign_recipients_insert_own_org on public.email_campaign_recipients for insert to authenticated
  with check (org_id = public.get_user_org_id());
create policy email_campaign_recipients_update_own_org on public.email_campaign_recipients for update to authenticated
  using (org_id = public.get_user_org_id());
create policy email_campaign_recipients_delete_own_org on public.email_campaign_recipients for delete to authenticated
  using (org_id = public.get_user_org_id());

create policy email_events_select_own_org on public.email_events for select to authenticated
  using (org_id = public.get_user_org_id());
create policy email_events_insert_own_org on public.email_events for insert to authenticated
  with check (org_id = public.get_user_org_id());
-- email_events は webhook 受信後の追記のみ、ユーザー更新/削除は不要

create policy email_unsubscribes_select_own_org on public.email_unsubscribes for select to authenticated
  using (org_id = public.get_user_org_id());
create policy email_unsubscribes_insert_own_org on public.email_unsubscribes for insert to authenticated
  with check (org_id = public.get_user_org_id());
create policy email_unsubscribes_update_own_org on public.email_unsubscribes for update to authenticated
  using (org_id = public.get_user_org_id());
create policy email_unsubscribes_delete_own_org on public.email_unsubscribes for delete to authenticated
  using (org_id = public.get_user_org_id());

-- ============================================================
-- 11. コメント
-- ============================================================
comment on table public.email_templates is 'メルマガHTMLテンプレ。blocks にはブロック型エディタの構造体を保存';
comment on table public.email_campaigns is '配信キャンペーン本体。body_htmlは送信時点のスナップショット';
comment on table public.email_campaign_recipients is '配信対象スナップショット。unsubscribe_token はメール毎にユニークなHMAC';
comment on table public.email_events is 'Resend Webhook 生イベント。resend_event_id で重複排除';
comment on table public.email_unsubscribes is 'オプトアウト管理。特定電子メール法対応';
