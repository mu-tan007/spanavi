-- =====================================================================
-- AI分析バッチ：25MB超等で分析不可能なファイルを SKIP マーキングで除外
--   問題: Whisper API は 25MB 制限。 超過した録音は処理できず無限リトライになる
--   対策:
--     1. ai_rejection_pending_targets の regex に SKIP プレフィックスを追加
--     2. 分析不能な call_record は rejection_reason に 'SKIP\n<理由>' を入れる
--        → RPC から除外され、 cron/バッチで再処理されない
--   注: 上限を 30→5000 に緩和したのも本migrationに統合
-- =====================================================================

set local search_path = public, extensions;

create or replace function public.ai_rejection_pending_targets(p_limit integer default 10)
returns table(id uuid)
language sql stable security definer set search_path to 'public' as $$
  select cr.id
  from call_records cr
  where cr.status = 'キーマン断り'
    and cr.recording_url is not null
    and (cr.rejection_reason is null or cr.rejection_reason !~ '^(HIGH|MEDIUM|LOW|SKIP)')
  order by cr.called_at desc nulls last
  limit greatest(1, least(p_limit, 5000));
$$;
