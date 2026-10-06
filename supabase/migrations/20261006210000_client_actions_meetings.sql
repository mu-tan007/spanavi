-- 予定を「面談」と「連絡」の2つに分ける（2026-10-06）
-- 面談：初回面談 / 検討面談 / キックオフ / 再キックオフ / 定例 / 追加提案（時刻を持つ）
-- 連絡：次のリスト依頼 / 報告書の提出 / 催促 / 支援開始の見込み / 再開の打診 / 再営業 / 再度の切り出し / その他
-- 面談は むー様のGoogleカレンダーから取り込む（gcal_event_id で同じ予定を二重にしない）
alter table public.client_actions
  add column if not exists category text not null default '連絡',
  add column if not exists at_time text,            -- 'HH:MM'（面談のみ）
  add column if not exists gcal_event_id text;
create unique index if not exists client_actions_gcal_uidx on public.client_actions(gcal_event_id) where gcal_event_id is not null;

-- 一覧の「次の一手」は連絡の一番早いもの、clients.next_contact_at は面談の一番早いもの（日本時間）
create or replace function public.sync_client_next_action(p_client uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a record; m record;
begin
  select kind, note, owner, due into a
    from client_actions
   where client_id = p_client and done_at is null and category = '連絡'
   order by due nulls last, created_at
   limit 1;
  select due, at_time into m
    from client_actions
   where client_id = p_client and done_at is null and category = '面談' and due is not null
   order by due, at_time nulls first
   limit 1;
  update clients set
    next_action = case when a.kind is null then null
                       when coalesce(a.note, '') = '' then a.kind
                       when a.kind = 'その他' then a.note
                       else a.kind || '：' || a.note end,
    next_action_owner = a.owner,
    next_action_due = a.due,
    next_contact_at = case when m.due is null then null
                           else ((m.due::text || ' ' || coalesce(m.at_time, '00:00'))::timestamp at time zone 'Asia/Tokyo') end
   where id = p_client;
end $$;

-- カレンダーから取り込めなかった（会社が1社に決まらない）予定。むー様が会社を選んで取り込む
create table if not exists public.calendar_import_unmatched (
  event_id text primary key,
  org_id uuid not null,
  title text not null,
  starts_at timestamptz not null,
  reason text,
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.calendar_import_unmatched enable row level security;
create policy calendar_import_unmatched_all on public.calendar_import_unmatched for all to authenticated
  using (org_id = get_user_org_id() and not is_client_user())
  with check (org_id = get_user_org_id() and not is_client_user());

-- 日本時間7〜23時の毎時5分にGoogleカレンダーから面談を取り込む
select cron.schedule('gcal-meetings-import', '5 22,23,0-14 * * *', $$
  select net.http_post(url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/gcal-meetings-import',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <anon key>'),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$);
