-- compute_campaign_segment のオーバーロード曖昧性を解消。
--
-- 20260709150000 までで 1引数版 f(jsonb) と 2引数版 f(jsonb, uuid DEFAULT NULL) が併存。
-- preview_campaign_recipients が 1引数で呼ぶため "function ... is not unique" エラーになる。
-- 2引数版(p_org_id 既定 NULL → get_user_org_id())に一本化し、1引数版を削除する。
-- send-campaign は 2引数で呼ぶため影響なし。preview は 1引数呼び出しが 2引数版(既定)に解決される。

set local search_path = public, extensions;

drop function if exists public.compute_campaign_segment(jsonb);

grant execute on function public.compute_campaign_segment(jsonb, uuid) to authenticated;
