-- =====================================================================
-- AI分析自動化（キーマン断り）
--   1. ai_rejection_pending_targets(p_limit) RPC: 未分析 N件の id を返す
--   2. pg_cron job analyze-rejection-batch-30min: 30分毎に Edge Function 呼出
--
-- Edge Function: supabase/functions/analyze-rejection-batch/index.ts
--   - 未分析 N件を取得し、 analyze-rejection-recording を並列 5 で内部呼出
--   - 結果は analyze-rejection-recording 側で rejection_reason に
--     `${recall_potential}\n${rejection_reason}` 形式で save
-- =====================================================================

set local search_path = public, extensions;

-- ── 1) 未分析 target を返す RPC ─────────────────────────────────
create or replace function public.ai_rejection_pending_targets(p_limit integer default 10)
returns table(id uuid)
language sql stable security definer set search_path to 'public' as $$
  select cr.id
  from call_records cr
  where cr.status = 'キーマン断り'
    and cr.recording_url is not null
    and (cr.rejection_reason is null or cr.rejection_reason !~ '^(HIGH|MEDIUM|LOW)')
  order by cr.called_at desc nulls last
  limit greatest(1, least(p_limit, 30));
$$;

-- ── 2) pg_cron 30分毎ジョブ ────────────────────────────────────
-- 1回 10件処理、 1日 48 cycles → 最大 480件/日（実需は数件/日でも余裕）
select cron.schedule(
  'analyze-rejection-batch-30min',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/analyze-rejection-batch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := '{"limit": 10}'::jsonb
  );
  $cron$
);
