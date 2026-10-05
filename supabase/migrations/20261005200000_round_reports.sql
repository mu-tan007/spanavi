-- 架電の周回報告（2026-10-05 篠宮）
--
-- リストを1周かけ終えるたびに、クライアント様への報告の下書きを作る。全リスト必須・2周目以降も毎周。
-- 下書きは round-reports（毎朝）が作り、むー様がスクリプトの改善案を書き込んでから「送信」する。
-- 改善案はAIに書かせない（むー様と相談して決める）。AIがまとめるのは相談用の材料だけで、先方には出さない。
--
-- 周回の数え方は架電記録（call_records.round）だけで決める。アーカイブ・アクティブの切り替えでは数え直さない。
-- 報告は「リスト×何周目」で1回だけ（kind='round' は一意）。途中で終えるときは画面から kind='manual' を作る。
set lock_timeout = '5s';

create table if not exists public.round_reports (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  list_id               uuid not null references public.call_lists(id) on delete cascade,
  client_id             uuid,
  round                 integer not null,
  kind                  text not null default 'round' check (kind in ('round', 'manual')),
  completed_at          timestamptz,                -- 周回の対象の90%に架電した時刻（manual は作った時刻）
  stats                 jsonb not null,
  draft_text            text,                       -- 先方への文面（改善案の欄は空けてある）
  materials             text,                       -- 相談用の材料（断られた理由のまとめ）。先方には出さない
  status                text not null default 'draft' check (status in ('draft', 'sent', 'dismissed')),
  slack_channel_id      text,
  slack_channel_options jsonb not null default '[]'::jsonb,  -- [{id, name}]
  sent_at               timestamptz,
  sent_by               uuid,
  sent_text             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists round_reports_list_round_uniq on public.round_reports (list_id, round) where kind = 'round';
create index if not exists round_reports_org_status_idx on public.round_reports (org_id, status, created_at desc);

alter table public.round_reports enable row level security;
drop policy if exists round_reports_select_admin on public.round_reports;
create policy round_reports_select_admin on public.round_reports for select to authenticated
  using (org_id = get_user_org_id() and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
drop policy if exists round_reports_update_admin on public.round_reports;
create policy round_reports_update_admin on public.round_reports for update to authenticated
  using (org_id = get_user_org_id() and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (org_id = get_user_org_id());
-- 作成・送信は Edge Function（service_role）だけ

-- ------------------------------------------------------------
-- 周回の進み具合
-- 1周目の対象：除外されていない企業（除外前に架電した企業も含む）
-- N周目の対象：N-1周目の結果が かけ直す状態（キーマン不在・不通・受付再コール・キーマン再コール）だった企業
-- completed_at：対象の90%に架電した時刻。100%は待たない（かけ直しの約束の時刻待ちなどで残るため）
-- ------------------------------------------------------------
create or replace function public.round_progress(p_list_id uuid)
returns table (round integer, targets integer, done integer, completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  with recs as (
    select item_id, round, status, called_at from call_records
     where list_id = p_list_id and round is not null and item_id is not null
  ),
  last_status as (
    select distinct on (item_id, round) item_id, round, status
      from recs order by item_id, round, called_at desc
  ),
  first_call as (
    select distinct on (item_id, round) item_id, round, called_at
      from recs order by item_id, round, called_at
  ),
  targets as (
    select 1 as round, i.id as item_id from call_list_items i
     where i.list_id = p_list_id
       and (not coalesce(i.is_excluded, false) or exists (select 1 from recs r where r.item_id = i.id))
    union all
    select s.round + 1, s.item_id from last_status s
     where s.status in ('キーマン不在', '不通', '受付再コール', 'キーマン再コール')
  ),
  joined as (
    select t.round, t.item_id, f.called_at
      from targets t left join first_call f on f.item_id = t.item_id and f.round = t.round
  ),
  agg as (
    select j.round, count(*)::int as targets, count(j.called_at)::int as done from joined j group by j.round
  ),
  nth as (
    select j.round, j.called_at, row_number() over (partition by j.round order by j.called_at) as rn
      from joined j where j.called_at is not null
  )
  select a.round, a.targets, a.done,
         (select n.called_at from nth n where n.round = a.round and n.rn = ceil(a.targets * 0.9)::int)
    from agg a
   where a.done > 0
   order by a.round
$$;
revoke all on function public.round_progress(uuid) from public, anon, authenticated;
grant execute on function public.round_progress(uuid) to service_role;

-- ------------------------------------------------------------
-- 報告に載せる数字。p_round のその周の結果、前の周、累計、つながりやすい曜日と時間帯（累計から）
-- 社長接続＝キーマン断り・キーマン再コール・アポ獲得（社長と話せた件数）
-- ------------------------------------------------------------
create or replace function public.round_report_stats(p_list_id uuid, p_round integer)
returns jsonb
language sql stable security definer set search_path = public as $$
  with recs as (
    select round, status, item_id, called_at at time zone 'Asia/Tokyo' as jst
      from call_records where list_id = p_list_id and round is not null and round <= p_round
  ),
  per_round as (
    select round,
           count(*)::int as calls,
           count(distinct item_id)::int as companies,
           count(*) filter (where status in ('キーマン断り', 'キーマン再コール', 'アポ獲得'))::int as talks,
           count(*) filter (where status = 'アポ獲得')::int as appo,
           min(jst)::date as first_day,
           max(jst)::date as last_day
      from recs group by round
  ),
  slots as (
    select extract(isodow from jst)::int as dow, extract(hour from jst)::int as hour,
           count(*)::int as calls,
           count(*) filter (where status in ('キーマン断り', 'キーマン再コール', 'アポ獲得'))::int as talks
      from recs group by 1, 2
  )
  select jsonb_build_object(
    'round', p_round,
    'this', (select to_jsonb(p) from per_round p where p.round = p_round),
    'prev', (select to_jsonb(p) from per_round p where p.round = p_round - 1),
    'rounds', coalesce((select jsonb_agg(to_jsonb(p) order by p.round) from per_round p), '[]'::jsonb),
    'total', (select jsonb_build_object(
                'calls', count(*), 'companies', count(distinct item_id),
                'talks', count(*) filter (where status in ('キーマン断り', 'キーマン再コール', 'アポ獲得')),
                'appo', count(*) filter (where status = 'アポ獲得'))
                from recs),
    'list_size', (select count(*) from call_list_items where list_id = p_list_id and not coalesce(is_excluded, false)),
    'best_slots', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.rate desc)
        from (select dow, hour, calls, talks, round(talks::numeric / calls, 4) as rate
                from slots where calls >= 30 order by talks::numeric / calls desc limit 3) s
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.round_report_stats(uuid, integer) from public, anon, authenticated;
grant execute on function public.round_report_stats(uuid, integer) to service_role;

-- 毎朝 7:30 JST に周回の終わったリストを調べて下書きを作る
select cron.unschedule('round-reports-detect') where exists (select 1 from cron.job where jobname = 'round-reports-detect');
select cron.schedule(
  'round-reports-detect',
  '30 22 * * *',
  $cron$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/round-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := '{"action":"detect"}'::jsonb,
    timeout_milliseconds := 300000
  );
  $cron$
);
