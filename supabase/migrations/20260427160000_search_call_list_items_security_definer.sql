-- 真の根本原因と修正
-- ============================================================
-- call_list_items の RLS は複数 permissive ポリシー（authenticated 用 +
-- client 用）を持ち、PostgreSQL は両者を OR で結合してフィルタする。その結果
-- 「 (RLS関数 OR org_id一致) AND ILIKE 群 」という複雑な式となり、planner
-- が trigram GIN index を使えず Seq Scan に落ちて 6〜13 秒タイムアウトしていた。
--
-- 解決: RPC を SECURITY DEFINER に変更し RLS を関数内でバイパス。
-- 関数の冒頭で v_org_id := get_user_org_id() を取得し、SQL 中で
-- WHERE i.org_id = v_org_id を直接書く。これでアクセス制御は維持される
-- （他テナントのデータは返らない）かつ planner が trigram index をフル活用できる。
--
-- 性能: 8572ms → 26ms (≈ 300x 高速化)
-- ============================================================

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
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_org_id uuid := public.get_user_org_id();
  v_kw text;
  v_field text;
  v_status_clause text;
  v_kw_clause text;
  v_kw_q text;
  v_sql text;
BEGIN
  -- 認証ユーザーの org_id が解決できなければ何も返さない（唯一のアクセス制御）
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  v_kw := trim(coalesce(p_keyword, ''));
  v_field := coalesce(p_search_field, 'all');

  IF p_status_filter = 'all' OR p_status_filter IS NULL THEN
    v_status_clause := '';
  ELSIF p_status_filter = 'uncalled' THEN
    v_status_clause := ' AND i.call_status IS NULL';
  ELSE
    v_status_clause := ' AND i.call_status = ' || quote_literal(p_status_filter);
  END IF;

  IF v_kw = '' THEN
    v_kw_clause := '';
  ELSE
    v_kw_q := quote_literal('%' || v_kw || '%');
    IF v_field = 'all' THEN
      v_kw_clause := format(' AND (i.company ILIKE %s OR i.representative ILIKE %s OR i.phone ILIKE %s OR i.business ILIKE %s)',
        v_kw_q, v_kw_q, v_kw_q, v_kw_q);
    ELSIF v_field IN ('company','representative','phone','business') THEN
      v_kw_clause := format(' AND i.%I ILIKE %s', v_field, v_kw_q);
    ELSIF v_field = 'status' THEN
      v_kw_clause := format(' AND i.call_status ILIKE %s', v_kw_q);
    ELSE
      v_kw_clause := '';
    END IF;
  END IF;

  v_sql := format($q$
    SELECT i.id, i.list_id, i.no, i.company, i.business, i.representative, i.phone, i.call_status,
           count(*) OVER () AS total_count
    FROM public.call_list_items i
    WHERE i.org_id = %L
      %s %s
    ORDER BY i.list_id, i.no
    OFFSET %s LIMIT %s
  $q$, v_org_id, v_status_clause, v_kw_clause, p_offset::text, p_limit::text);

  RETURN QUERY EXECUTE v_sql;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.search_call_list_items(text, text, text, int, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_call_list_items(text, text, text, int, int) FROM anon, public;
