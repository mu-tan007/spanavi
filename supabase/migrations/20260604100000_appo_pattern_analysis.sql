-- =====================================================================
-- アポ取得パターンAI分析機能
--   appointments テーブルにパターン分類・話し方タグ・効いた話し方カラムを追加
--   過去アポを夜間バッチで分析するための RPC + pg_cron 設定
--
--  Edge Function:
--   - transcribe-recording (拡張): 録音文字起こし時に同時にパターン分析も保存
--   - analyze-appo-patterns-batch (新規): appo_pattern is null のアポを30件単位で
--     Haiku 4.5 で分析し DB UPDATE
-- =====================================================================

set local search_path = public, extensions;

-- ── 1) appointments にカラム追加 ────────────────────────────────
alter table public.appointments
  add column if not exists appo_pattern     text,
  add column if not exists talk_style_tags  text[],
  add column if not exists talk_strength    text;

comment on column public.appointments.appo_pattern is
  'AI分析によるアポ取得パターン: smooth / negative_to_positive / keyman_difficulty / after_concern / standard / unknown';
comment on column public.appointments.talk_style_tags is
  'AI抽出のアポインター話し方タグ (最大5個)';
comment on column public.appointments.talk_strength is
  'このアポ取得で特に効いたと推定される話し方 (1-2文)';

create index if not exists idx_appointments_appo_pattern
  on public.appointments(appo_pattern) where appo_pattern is not null;

create index if not exists idx_appointments_pattern_pending
  on public.appointments(created_at desc nulls last)
  where appo_pattern is null and appo_report is not null;

-- ── 2) 未分析 target を返す RPC ─────────────────────────────────
create or replace function public.ai_appo_pattern_pending_targets(p_limit integer default 30)
returns table(id uuid)
language sql stable security definer set search_path to 'public' as $$
  select a.id
  from public.appointments a
  where a.appo_pattern is null
    and a.appo_report is not null
    and length(a.appo_report) >= 50
    and coalesce(a.status, '') not in ('キャンセル')
  order by a.created_at desc nulls last
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.ai_appo_pattern_pending_targets(integer) to anon, authenticated, service_role;

-- ── 3) Analytics 画面用サマリ RPC ───────────────────────────────
create or replace function public.appo_pattern_summary(
  p_from timestamptz default null,
  p_to   timestamptz default null,
  p_member text default null
)
returns table(
  appo_pattern text,
  cnt          bigint,
  total_sales  bigint,
  avg_sales    numeric,
  sample_strengths text[]
)
language sql stable security definer set search_path to 'public' as $$
  with base as (
    select
      coalesce(a.appo_pattern, 'unknown') as pat,
      coalesce(a.sales_amount, 0)         as sales,
      a.talk_strength
    from public.appointments a
    where (p_from is null or a.created_at >= p_from)
      and (p_to   is null or a.created_at <= p_to)
      and (p_member is null or a.getter_name = p_member)
      and a.appo_pattern is not null
  )
  select
    pat,
    count(*)::bigint,
    sum(sales)::bigint,
    avg(sales)::numeric,
    (array_agg(talk_strength) filter (where talk_strength is not null and length(talk_strength) > 0))[1:5]
  from base
  group by pat
  order by count(*) desc;
$$;

grant execute on function public.appo_pattern_summary(timestamptz, timestamptz, text) to anon, authenticated, service_role;

-- ── 4) メンバー × 話し方タグ集計 RPC ───────────────────────────
create or replace function public.appo_pattern_member_tags(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table(
  getter_name text,
  tag         text,
  cnt         bigint
)
language sql stable security definer set search_path to 'public' as $$
  select
    a.getter_name,
    t.tag,
    count(*)::bigint
  from public.appointments a
  cross join lateral unnest(coalesce(a.talk_style_tags, '{}'::text[])) as t(tag)
  where a.appo_pattern is not null
    and a.getter_name is not null
    and (p_from is null or a.created_at >= p_from)
    and (p_to   is null or a.created_at <= p_to)
    and length(t.tag) > 0
  group by a.getter_name, t.tag
  order by a.getter_name, count(*) desc;
$$;

grant execute on function public.appo_pattern_member_tags(timestamptz, timestamptz) to anon, authenticated, service_role;

-- ── 5) 効いた話し方トップN ──────────────────────────────────────
create or replace function public.appo_pattern_top_tags(
  p_from timestamptz default null,
  p_to   timestamptz default null,
  p_member text default null,
  p_limit integer default 10
)
returns table(
  tag           text,
  cnt           bigint,
  total_sales   bigint,
  avg_sales     numeric
)
language sql stable security definer set search_path to 'public' as $$
  select
    t.tag,
    count(*)::bigint                       as cnt,
    sum(coalesce(a.sales_amount, 0))::bigint as total_sales,
    avg(coalesce(a.sales_amount, 0))::numeric as avg_sales
  from public.appointments a
  cross join lateral unnest(coalesce(a.talk_style_tags, '{}'::text[])) as t(tag)
  where a.appo_pattern is not null
    and (p_from is null or a.created_at >= p_from)
    and (p_to   is null or a.created_at <= p_to)
    and (p_member is null or a.getter_name = p_member)
    and length(t.tag) > 0
  group by t.tag
  order by count(*) desc
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.appo_pattern_top_tags(timestamptz, timestamptz, text, integer) to anon, authenticated, service_role;

-- ── 6) pg_cron: 1日1回 深夜 03:30 JST = 18:30 UTC バッチ起動 ─────
do $$
begin
  perform cron.unschedule('analyze-appo-patterns-nightly');
exception when others then
  null;
end $$;

select cron.schedule(
  'analyze-appo-patterns-nightly',
  '30 18 * * *',
  $cron$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/analyze-appo-patterns-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := '{"limit": 30}'::jsonb
  );
  $cron$
);
