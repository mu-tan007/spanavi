-- 事前確認の結果を1回の電話ごとに残す（2026-10-04）
--
-- 集中モードの「事前確認」ボタンで1行できる。録音の取得・#事前確認 スレッドへの返信・
-- 顧客への報告の下書き作成は process-precheck-events（毎分）が後から埋める。
-- 架電履歴（call_records）には入れない。入れると架電数・接続率の集計に混ざり、
-- 録音の保存処理がアポ取得報告の録音URLを上書きする経路があるため。
set lock_timeout = '5s';

create table if not exists public.precheck_events (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  appointment_id     uuid not null references public.appointments(id) on delete cascade,
  item_id            uuid,
  result             text not null check (result in ('確認完了', 'リスケ', 'キャンセル', '不在', '不通')),
  memo               text,
  recall_at          timestamptz,          -- 不在・不通のときの「かけ直す時刻」
  called_phone       text,
  caller_name        text,
  caller_zoom_user_id text,
  called_at          timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  -- 録音: pending → found / none
  recording_status   text not null default 'pending',
  recording_attempts integer not null default 0,
  recording_url      text,
  -- #事前確認 スレッドへの返信: pending → posted / failed
  slack_status       text not null default 'pending',
  slack_ts           text,
  -- 顧客への報告の下書き: none（作らない）/ pending → created（Gmail）/ ready（Slack・Chatwork用の文面）/ sent / failed
  draft_status       text not null default 'none',
  draft_channel      text,                 -- email / slack / chatwork
  draft_text         text,
  draft_error        text,
  gmail_thread_id    text,
  gmail_draft_id     text,
  draft_sent_at      timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists precheck_events_appointment_idx on public.precheck_events (appointment_id, called_at desc);
create index if not exists precheck_events_pending_idx on public.precheck_events (created_at)
  where recording_status = 'pending' or slack_status = 'pending' or draft_status = 'pending';

alter table public.precheck_events enable row level security;

drop policy if exists precheck_events_select_own_org on public.precheck_events;
create policy precheck_events_select_own_org on public.precheck_events for select to authenticated
  using (org_id = get_user_org_id() and not is_client_user());
drop policy if exists precheck_events_insert_own_org on public.precheck_events;
create policy precheck_events_insert_own_org on public.precheck_events for insert to authenticated
  with check (org_id = get_user_org_id() and not is_client_user());
drop policy if exists precheck_events_update_own_org on public.precheck_events;
create policy precheck_events_update_own_org on public.precheck_events for update to authenticated
  using (org_id = get_user_org_id() and not is_client_user())
  with check (org_id = get_user_org_id() and not is_client_user());

-- 毎朝の #事前確認 投稿の識別番号（ts）と、その投稿に載せたアポ。スレッド返信の宛先を引くのに使う
create table if not exists public.precheck_slack_posts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  channel_id      text not null,
  ts              text not null,
  appointment_ids uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists precheck_slack_posts_org_created_idx on public.precheck_slack_posts (org_id, created_at desc);
create index if not exists precheck_slack_posts_appo_gin on public.precheck_slack_posts using gin (appointment_ids);
alter table public.precheck_slack_posts enable row level security;
-- 読み書きは Edge Function（service_role）だけ。画面からは触らない

-- アポ取得報告メールのスレッド（返信の下書きを同じスレッドに作るため）
alter table public.appointments add column if not exists report_gmail_thread_id text;

-- 事前確認の報告に録音リンクを付ける顧客（当面ユニヴィス様のみ）
alter table public.clients add column if not exists precheck_share_recording boolean not null default false;
update public.clients set precheck_share_recording = true
 where id = 'ec42e6f1-ffd4-48b7-866e-06e3c5f53c79';

-- #事前確認 チャンネルとメンション先（Spartia組織）
insert into public.org_settings (org_id, setting_key, setting_value)
select 'a0000000-0000-0000-0000-000000000001', k, v
  from (values ('slack_channel_precheck', 'C09RMJADCJX'), ('slack_precheck_mention_user', 'U08T8DQ79V1')) as t(k, v)
 where not exists (
   select 1 from public.org_settings s
    where s.org_id = 'a0000000-0000-0000-0000-000000000001' and s.setting_key = t.k
 );
