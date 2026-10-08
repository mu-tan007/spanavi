-- クライアントからの返信 → インターンへの伝言の下書き（2026-10-08 むー様）
-- client-reply-relay が報告のメール・Slackのスレッドへの返信を読み、事前確認で先方に伝えることがあれば下書きを作る
create table if not exists public.client_reply_relays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  source text not null,              -- email | slack
  source_ref text not null,          -- 読んだ返信（同じ返信を二度読まない）
  client_text text,
  tell_text text,                    -- 先方に伝えること（AIが抜き出したもの）
  draft_text text,                   -- インターンへの伝言の下書き
  slack_channel text,
  slack_thread_ts text,              -- 社内の #アポ取得報告 の該当の投稿（見つからなければ空＝チャンネルに直接）
  status text not null default 'ready', -- ready | sent | dismissed | none（伝えることが無かった返信）
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (appointment_id, source_ref)
);
alter table public.client_reply_relays enable row level security;
create policy client_reply_relays_admin_read on public.client_reply_relays for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.org_id = client_reply_relays.org_id));

insert into public.internal_cron_tokens (name) values ('client-reply-relay') on conflict do nothing;
select cron.unschedule('client-reply-relay') where exists (select 1 from cron.job where jobname = 'client-reply-relay');
select cron.schedule(
  'client-reply-relay',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/client-reply-relay',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-token', (select token from public.internal_cron_tokens where name = 'client-reply-relay')),
    body := '{"mode":"scan"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
