-- 企業検索 RPC: 5 カラム OR-ILIKE を SQL レベルで実行し RLS も尊重する
-- supabase-js の .or() URL 構築の制約や PostgREST の or 構文と日本語キーワードの
-- 組合せで結果が空になる現象を回避するため、SQL 側で直接 OR-ILIKE を組む。
CREATE OR REPLACE FUNCTION public.search_call_list_items(
  p_keyword       text DEFAULT '',
  p_search_field  text DEFAULT 'all',
  p_status_filter text DEFAULT 'all',
  p_offset        int  DEFAULT 0,
  p_limit         int  DEFAULT 100
)
RETURNS TABLE (
  id            uuid,
  list_id       uuid,
  no            integer,
  company       text,
  business      text,
  representative text,
  phone         text,
  call_status   text,
  total_count   bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := public.get_user_org_id();
  v_kw text;
  v_status_label text;
BEGIN
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  v_kw := trim(coalesce(p_keyword, ''));
  v_status_label := NULL;
  IF p_status_filter = 'uncalled' THEN
    v_status_label := '__UNCALLED__';
  ELSIF p_status_filter <> 'all' THEN
    v_status_label := p_status_filter;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT i.id, i.list_id, i.no, i.company, i.business, i.representative, i.phone, i.call_status
    FROM public.call_list_items i
    WHERE i.org_id = v_org_id
      AND (
        v_status_label IS NULL
        OR (v_status_label = '__UNCALLED__' AND i.call_status IS NULL)
        OR (v_status_label <> '__UNCALLED__' AND i.call_status = v_status_label)
      )
      AND (
        v_kw = ''
        OR (
          (p_search_field = 'all' AND (
            i.company        ILIKE '%' || v_kw || '%'
            OR i.representative ILIKE '%' || v_kw || '%'
            OR i.phone          ILIKE '%' || v_kw || '%'
            OR i.business       ILIKE '%' || v_kw || '%'
          ))
          OR (p_search_field = 'company'        AND i.company        ILIKE '%' || v_kw || '%')
          OR (p_search_field = 'representative' AND i.representative ILIKE '%' || v_kw || '%')
          OR (p_search_field = 'phone'          AND i.phone          ILIKE '%' || v_kw || '%')
          OR (p_search_field = 'business'       AND i.business       ILIKE '%' || v_kw || '%')
          OR (p_search_field = 'status'         AND i.call_status    ILIKE '%' || v_kw || '%')
        )
      )
  ),
  counted AS (
    SELECT count(*)::bigint AS c FROM base
  )
  SELECT b.id, b.list_id, b.no, b.company, b.business, b.representative, b.phone, b.call_status, c.c
  FROM base b CROSS JOIN counted c
  ORDER BY b.list_id, b.no
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_call_list_items(text, text, text, int, int) TO authenticated;
