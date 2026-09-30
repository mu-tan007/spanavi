-- スパキャリ営業の流れ（送信→返信→面談獲得→面談→成約→入金）を一本で見るための受け皿。
-- 設計: tasks/sekkei_spacareer_sales_funnel.md（2026-10-01）
--
--   送信はリードにしない。cw_sent_workers_global（worker_id 一意・72,736件）をその都度数える。
--   リードは「返信」か「面談獲得」が起きた時点で生まれる。主キーは代理キー（uuid）。
--   出来事は spacareer_sales_events に追記する。Slack投稿は原文を保存し (channel_id, ts) で冪等。
--   閲覧・更新は cw_* と同じく users.role='admin' のみ。

-- 名前の照合に使う正規化（NFKC → 空白を全部除く → 小文字）。
create or replace function public.spacareer_norm_name(p text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select nullif(lower(regexp_replace(normalize(coalesce(p, ''), NFKC), '\s', '', 'g')), '')
$$;

-- ---------------------------------------------------------------
-- 営業マン（members に居ない人が半分いるので専用の表で持つ）
-- ---------------------------------------------------------------
create table if not exists public.spacareer_sales_reps (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  slack_user_id text unique,
  member_id uuid references public.members(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cw_licenses
  add column if not exists rep_id uuid references public.spacareer_sales_reps(id) on delete set null;

-- 送信の成否。過去分は NULL（不明）。failed は重複よけから外して再送できるようにする（管理サーバー側）。
alter table public.cw_sent_workers_global
  add column if not exists status text check (status in ('sent', 'failed')),
  add column if not exists fail_reason text;

create index if not exists idx_cw_sent_workers_norm_name
  on public.cw_sent_workers_global (public.spacareer_norm_name(worker_name));

-- ---------------------------------------------------------------
-- リード（見込み客）
-- ---------------------------------------------------------------
create table if not exists public.spacareer_sales_leads (
  id uuid primary key default gen_random_uuid(),
  cw_worker_id text,
  display_name text not null,
  source text not null default 'unknown'
    check (source in ('cw_scout', 'cw_apply', 'fukugyo', 'other', 'unknown')),
  match_method text not null default 'none'
    check (match_method in ('reply', 'exact_name', 'manual', 'none')),
  spacareer_customer_id uuid references public.spacareer_customers(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_spacareer_sales_leads_cw_worker
  on public.spacareer_sales_leads (cw_worker_id) where cw_worker_id is not null;

-- 人が一度結びつけた呼び名を覚えておき、次の投稿から自動で結びつける。
create table if not exists public.spacareer_sales_lead_aliases (
  name_norm text primary key,
  lead_id uuid not null references public.spacareer_sales_leads(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Slack投稿の原文
-- ---------------------------------------------------------------
create table if not exists public.spacareer_sales_slack_raw (
  channel_id text not null,
  ts text not null,
  user_id text,
  text text not null,
  posted_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  primary key (channel_id, ts)
);

-- ---------------------------------------------------------------
-- 出来事（追記型）
--   kind:
--     replied        CWで返信があった（ボット）
--     booked         初回面談を獲得した（Slack 初回面談獲得ワークフロー）
--     first_meeting  初回面談の結果（Slack アポ商談登録）
--     re_meeting     再アポ面談の結果（Slack 再アポ商談登録）
--     closing        クロージング面談の結果（Slack クロ商談登録）
-- ---------------------------------------------------------------
create table if not exists public.spacareer_sales_events (
  id bigint generated always as identity primary key,
  lead_id uuid references public.spacareer_sales_leads(id) on delete set null,
  kind text not null
    check (kind in ('replied', 'booked', 'first_meeting', 're_meeting', 'closing')),
  occurred_at timestamptz not null,
  scheduled_at timestamptz,
  rep_id uuid references public.spacareer_sales_reps(id) on delete set null,
  rep_slack_user_id text,
  result text,
  is_won boolean not null default false,
  next_at text,
  recording_url text,
  worker_name_raw text,
  worker_name_norm text,
  appointer_rep_id uuid references public.spacareer_sales_reps(id) on delete set null,
  closer_rep_id uuid references public.spacareer_sales_reps(id) on delete set null,
  source text not null check (source in ('slack', 'cw_bot', 'manual')),
  source_ref text not null unique,
  attrs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_spacareer_sales_events_lead on public.spacareer_sales_events (lead_id, occurred_at);
create index if not exists idx_spacareer_sales_events_unlinked on public.spacareer_sales_events (worker_name_norm) where lead_id is null;
create index if not exists idx_spacareer_sales_events_kind_time on public.spacareer_sales_events (kind, occurred_at);

-- ---------------------------------------------------------------
-- 照合：未照合の出来事をリードに結びつける
--   ① 覚えた呼び名 → ② 送信記録の名前が完全一致で1人に決まる → ③ 残す（人が選ぶ）
--   成約の出来事には、その時点のアポ担当（直近の初回面談／再アポの担当）を書き込む。
-- ---------------------------------------------------------------
create or replace function public.spacareer_sales_link_events()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_lead uuid;
  v_hit_count int;
  v_worker record;
  v_linked int := 0;
  v_left int := 0;
begin
  -- 担当者の Slack ID を rep_id に解決（reps を後から足しても効くよう毎回流す）
  update spacareer_sales_events e
     set rep_id = r2.id
    from spacareer_sales_reps r2
   where e.rep_id is null and e.rep_slack_user_id = r2.slack_user_id;

  for r in
    select distinct worker_name_norm, min(worker_name_raw) as raw
      from spacareer_sales_events
     where lead_id is null and worker_name_norm is not null
     group by worker_name_norm
  loop
    v_lead := null;

    select lead_id into v_lead from spacareer_sales_lead_aliases where name_norm = r.worker_name_norm;

    if v_lead is null then
      select count(*) into v_hit_count
        from cw_sent_workers_global
       where spacareer_norm_name(worker_name) = r.worker_name_norm;

      if v_hit_count = 1 then
        select w.worker_id, w.worker_name into v_worker
          from cw_sent_workers_global w
         where spacareer_norm_name(w.worker_name) = r.worker_name_norm;

        insert into spacareer_sales_leads (cw_worker_id, display_name, source, match_method)
        values (v_worker.worker_id, v_worker.worker_name, 'cw_scout', 'exact_name')
        on conflict (cw_worker_id) where cw_worker_id is not null
        do update set updated_at = now()
        returning id into v_lead;

        insert into spacareer_sales_lead_aliases (name_norm, lead_id)
        values (r.worker_name_norm, v_lead)
        on conflict (name_norm) do nothing;
      end if;
    end if;

    if v_lead is not null then
      update spacareer_sales_events
         set lead_id = v_lead
       where lead_id is null and worker_name_norm = r.worker_name_norm;
      v_linked := v_linked + 1;
    else
      v_left := v_left + 1;
    end if;
  end loop;

  -- 成約時点のアポ担当を書き込む（未記入のものだけ）
  update spacareer_sales_events c
     set appointer_rep_id = (
           select m.rep_id from spacareer_sales_events m
            where m.lead_id = c.lead_id
              and m.kind in ('first_meeting', 're_meeting')
              and m.occurred_at <= c.occurred_at
            order by m.occurred_at desc
            limit 1)
   where c.kind = 'closing' and c.is_won and c.appointer_rep_id is null and c.lead_id is not null;

  update spacareer_sales_events
     set closer_rep_id = rep_id
   where kind = 'closing' and is_won and closer_rep_id is null and rep_id is not null;

  return jsonb_build_object('linked_names', v_linked, 'unlinked_names', v_left);
end;
$$;

-- 人が未照合の名前をリードに結びつける（CWの worker_id を指定するか、既存リードを指定するか、新規で作る）
create or replace function public.spacareer_sales_link_name(
  p_name_norm text,
  p_cw_worker_id text default null,
  p_lead_id uuid default null,
  p_new_display_name text default null,
  p_source text default 'unknown'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead uuid := p_lead_id;
  v_name text;
begin
  if not exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin') then
    raise exception 'admin only';
  end if;

  if v_lead is null and p_cw_worker_id is not null then
    select worker_name into v_name from cw_sent_workers_global where worker_id = p_cw_worker_id;
    insert into spacareer_sales_leads (cw_worker_id, display_name, source, match_method)
    values (p_cw_worker_id, coalesce(v_name, p_new_display_name, p_name_norm), 'cw_scout', 'manual')
    on conflict (cw_worker_id) where cw_worker_id is not null
    do update set updated_at = now()
    returning id into v_lead;
  elsif v_lead is null then
    insert into spacareer_sales_leads (display_name, source, match_method)
    values (coalesce(p_new_display_name, p_name_norm), p_source, 'manual')
    returning id into v_lead;
  end if;

  insert into spacareer_sales_lead_aliases (name_norm, lead_id)
  values (p_name_norm, v_lead)
  on conflict (name_norm) do update set lead_id = excluded.lead_id;

  update spacareer_sales_events set lead_id = v_lead
   where lead_id is null and worker_name_norm = p_name_norm;

  perform spacareer_sales_link_events();
  return v_lead;
end;
$$;

revoke all on function public.spacareer_sales_link_events() from public, anon, authenticated;
revoke all on function public.spacareer_sales_link_name(text, text, uuid, text, text) from public, anon;
grant execute on function public.spacareer_sales_link_name(text, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------
-- 週×担当者の流れ（画面の集計の正）
--   送信: cw_sent_workers_global（status='failed' は除く）→ ライセンスの担当者
--   それ以外: 出来事の担当者。日付は JST の週（月曜始まり）
-- ---------------------------------------------------------------
create or replace view public.spacareer_sales_funnel_weekly_v
with (security_invoker = true) as
with sent as (
  select date_trunc('week', (w.sent_at at time zone 'Asia/Tokyo'))::date as week,
         coalesce(rp.display_name, l.user_name, '不明') as rep_name,
         count(*) as n
    from cw_sent_workers_global w
    left join cw_licenses l on l.license_key = w.license_key
    left join spacareer_sales_reps rp on rp.id = l.rep_id
   where coalesce(w.status, 'sent') <> 'failed'
   group by 1, 2
),
ev as (
  select date_trunc('week', (e.occurred_at at time zone 'Asia/Tokyo'))::date as week,
         coalesce(rp.display_name, '不明') as rep_name,
         count(*) filter (where e.kind = 'replied') as replied,
         count(*) filter (where e.kind = 'booked') as booked,
         count(*) filter (where e.kind = 'first_meeting') as first_meetings,
         count(*) filter (where e.kind = 'first_meeting' and e.result in ('飛び', 'キャンセル')) as no_shows,
         count(*) filter (where e.kind in ('re_meeting', 'closing')) as later_meetings,
         count(*) filter (where e.kind = 'closing' and e.is_won) as won
    from spacareer_sales_events e
    left join spacareer_sales_reps rp on rp.id = e.rep_id
   group by 1, 2
)
select coalesce(s.week, ev.week) as week,
       coalesce(s.rep_name, ev.rep_name) as rep_name,
       coalesce(s.n, 0) as sent,
       coalesce(ev.replied, 0) as replied,
       coalesce(ev.booked, 0) as booked,
       coalesce(ev.first_meetings, 0) as first_meetings,
       coalesce(ev.no_shows, 0) as no_shows,
       coalesce(ev.later_meetings, 0) as later_meetings,
       coalesce(ev.won, 0) as won
  from sent s
  full join ev on ev.week = s.week and ev.rep_name = s.rep_name;

-- ---------------------------------------------------------------
-- RLS（admin のみ）
-- ---------------------------------------------------------------
alter table public.spacareer_sales_reps enable row level security;
alter table public.spacareer_sales_leads enable row level security;
alter table public.spacareer_sales_lead_aliases enable row level security;
alter table public.spacareer_sales_slack_raw enable row level security;
alter table public.spacareer_sales_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['spacareer_sales_reps', 'spacareer_sales_leads', 'spacareer_sales_lead_aliases',
                           'spacareer_sales_slack_raw', 'spacareer_sales_events']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))$p$,
      t || '_admin_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 営業マンの初期登録（Slack ID は 2026-10-01 に Slack で確認）
-- ---------------------------------------------------------------
insert into public.spacareer_sales_reps (display_name, slack_user_id) values
  ('平山晴輝', 'U0B862S58N6'),
  ('石井佑弥', 'U0A3C80HFEZ'),
  ('鈴木早紀', 'U0BQFSMCUQY'),
  ('鍛冶雅也', 'U0A99M86P1D'),
  ('野堀涼平', 'U0BPMFT6PKL')
on conflict (slack_user_id) do nothing;

insert into public.spacareer_sales_reps (display_name, slack_user_id)
select '田中', null
where not exists (select 1 from public.spacareer_sales_reps where display_name = '田中');

update public.spacareer_sales_reps r set member_id = m.id
  from public.members m
 where r.member_id is null
   and replace(m.name, ' ', '') = r.display_name;

-- ライセンス → 担当者（台帳の user_name で対応。趙＝鈴木早紀さんのライセンス）
update public.cw_licenses l set rep_id = r.id
  from public.spacareer_sales_reps r
 where l.rep_id is null
   and ((l.user_name = '平山' and r.display_name = '平山晴輝')
     or (l.user_name = '石井' and r.display_name = '石井佑弥')
     or (l.user_name = '趙'   and r.display_name = '鈴木早紀')
     or (l.user_name in ('鍛冶', '鍛冶②') and r.display_name = '鍛冶雅也'));
