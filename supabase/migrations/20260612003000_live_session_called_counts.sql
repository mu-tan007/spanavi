set local search_path = public, extensions;

-- ライブ稼働状況の架電数集計を1往復化（P2、本番適用・新旧一致検証済み）
-- 旧: セッションごとに call_records から item_id 全件を取得して
--     クライアント側で distinct カウント（30秒毎×セッション数のN+1）
create or replace function public.live_session_called_counts(p_sessions jsonb)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_object_agg(s->>'id', c.cnt), '{}'::jsonb)
  from jsonb_array_elements(p_sessions) s
  cross join lateral (
    select count(distinct cr.item_id) as cnt
    from call_records cr
    where cr.org_id = get_user_org_id()
      and cr.list_id = (s->>'list_id')::uuid
      and cr.called_at >= (s->>'started_at')::timestamptz
      and (coalesce(s->>'finished_at', '') = '' or cr.called_at <= (s->>'finished_at')::timestamptz)
  ) c;
$$;
