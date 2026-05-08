-- =====================================================================
-- search_company_master RPC のタイムアウト対策
--
-- 背景:
--   ヒット件数が中規模（数千〜数万件）でデフォルトソート (id ASC) のとき、
--   Postgres planner が「PK index を id 順に走査しながら filter で絞る」
--   プランを誤選択し、14万行スキャン → 16〜23 秒タイムアウト発生。
--   chat検索の実例: industry_major='E 製造業' AND 関東4都県 AND revenue_k>=500000
--   → 実ヒット 9,312 件で 16.6 秒、statement_timeout に引っかかる。
--
-- 対策:
--   ヒット件数 <= 100K のとき、function スコープで一時的に
--   enable_indexscan / enable_indexonlyscan を OFF にして、Bitmap Heap Scan
--   を確実に選ばせる。これで 16.6s → 974ms（17倍）に短縮。
--   Buffers: 148K → 14K に削減。
--
--   100K 超のヒットでは PK 走査が逆に有利なので index scan を許可（既存挙動維持）。
--
--   関数を STABLE → デフォルト (VOLATILE) に変更（set_config を安全に使うため）。
--   呼び出し側 (companyMasterApi.js / RPC parameters) は変更なし。
-- =====================================================================

set local search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.search_company_master(
  p_keyword text DEFAULT NULL::text,
  p_daibunrui_arr text[] DEFAULT NULL::text[],
  p_saibunrui_arr text[] DEFAULT NULL::text[],
  p_prefecture_arr text[] DEFAULT NULL::text[],
  p_city text DEFAULT NULL::text,
  p_revenue_min bigint DEFAULT NULL::bigint,
  p_revenue_max bigint DEFAULT NULL::bigint,
  p_revenue_include_null boolean DEFAULT NULL::boolean,
  p_revenue_exclude_null boolean DEFAULT NULL::boolean,
  p_net_income_min bigint DEFAULT NULL::bigint,
  p_net_income_max bigint DEFAULT NULL::bigint,
  p_net_income_include_null boolean DEFAULT NULL::boolean,
  p_net_income_exclude_null boolean DEFAULT NULL::boolean,
  p_age_min smallint DEFAULT NULL::smallint,
  p_age_max smallint DEFAULT NULL::smallint,
  p_age_include_null boolean DEFAULT NULL::boolean,
  p_age_exclude_null boolean DEFAULT NULL::boolean,
  p_employee_min integer DEFAULT NULL::integer,
  p_employee_max integer DEFAULT NULL::integer,
  p_employee_include_null boolean DEFAULT NULL::boolean,
  p_employee_exclude_null boolean DEFAULT NULL::boolean,
  p_phone_pattern text DEFAULT NULL::text,
  p_established_min smallint DEFAULT NULL::smallint,
  p_established_max smallint DEFAULT NULL::smallint,
  p_shareholder_type_arr text[] DEFAULT NULL::text[],
  p_rep_shareholder_match boolean DEFAULT NULL::boolean,
  p_logic text DEFAULT 'AND'::text,
  p_sort_col text DEFAULT NULL::text,
  p_sort_dir text DEFAULT 'asc'::text,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE(
  id bigint, company_name text, business_description text, postal_code text,
  prefecture text, city text, address text, full_address text,
  revenue_k bigint, net_income_k bigint, ordinary_income_k bigint, capital_k bigint,
  established_year smallint, representative text, representative_age smallint,
  employee_count integer, industry_major text, industry_sub text, phone text,
  tsr_id text, remarks text, source_file text, shareholders text, officers text,
  clients text, total_count bigint
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_sort    TEXT := LOWER(COALESCE(p_sort_col, ''));
  v_dir     TEXT := CASE WHEN LOWER(COALESCE(p_sort_dir,'asc')) = 'desc' THEN 'DESC' ELSE 'ASC' END;
  v_order   TEXT;
  v_is_or   BOOLEAN := (UPPER(COALESCE(p_logic, 'AND')) = 'OR');
  v_joiner  TEXT;
  v_conds   TEXT[] := '{}';
  v_where   TEXT;
  v_count   BIGINT;
  v_parts   TEXT[];
BEGIN
  v_order := CASE v_sort
    WHEN 'company_name'       THEN 'cm.company_name '       || v_dir
    WHEN 'revenue_k'          THEN 'cm.revenue_k '          || v_dir || ' NULLS LAST'
    WHEN 'net_income_k'       THEN 'cm.net_income_k '       || v_dir || ' NULLS LAST'
    WHEN 'ordinary_income_k'  THEN 'cm.ordinary_income_k '  || v_dir || ' NULLS LAST'
    WHEN 'capital_k'          THEN 'cm.capital_k '          || v_dir || ' NULLS LAST'
    WHEN 'established_year'   THEN 'cm.established_year '   || v_dir || ' NULLS LAST'
    WHEN 'employee_count'     THEN 'cm.employee_count '     || v_dir || ' NULLS LAST'
    WHEN 'representative_age' THEN 'cm.representative_age ' || v_dir || ' NULLS LAST'
    WHEN 'prefecture'         THEN 'cm.prefecture '         || v_dir
    WHEN 'industry_major'     THEN 'cm.industry_major '     || v_dir
    WHEN 'industry_sub'       THEN 'cm.industry_sub '       || v_dir
    ELSE 'cm.id ASC'
  END;

  v_joiner := CASE WHEN v_is_or THEN ' OR ' ELSE ' AND ' END;

  IF p_keyword IS NOT NULL THEN
    v_conds := v_conds || format(
      $f$(cm.company_name ILIKE '%%' || %L || '%%' OR cm.business_description ILIKE '%%' || %L || '%%')$f$,
      p_keyword, p_keyword);
  END IF;

  IF p_daibunrui_arr IS NOT NULL THEN
    IF array_length(p_daibunrui_arr, 1) = 1 THEN v_conds := v_conds || format('cm.industry_major = %L', p_daibunrui_arr[1]);
    ELSE v_conds := v_conds || format('cm.industry_major = ANY(%L::TEXT[])', p_daibunrui_arr); END IF;
  END IF;
  IF p_saibunrui_arr IS NOT NULL THEN
    IF array_length(p_saibunrui_arr, 1) = 1 THEN v_conds := v_conds || format('cm.industry_sub = %L', p_saibunrui_arr[1]);
    ELSE v_conds := v_conds || format('cm.industry_sub = ANY(%L::TEXT[])', p_saibunrui_arr); END IF;
  END IF;
  IF p_prefecture_arr IS NOT NULL THEN
    IF array_length(p_prefecture_arr, 1) = 1 THEN v_conds := v_conds || format('cm.prefecture = %L', p_prefecture_arr[1]);
    ELSE v_conds := v_conds || format('cm.prefecture = ANY(%L::TEXT[])', p_prefecture_arr); END IF;
  END IF;
  IF p_city IS NOT NULL THEN v_conds := v_conds || format('cm.city ILIKE %L || ''%%''', p_city); END IF;

  v_parts := '{}';
  IF p_revenue_min IS NOT NULL THEN v_parts := array_append(v_parts, format('cm.revenue_k >= %s', p_revenue_min)); END IF;
  IF p_revenue_max IS NOT NULL THEN v_parts := array_append(v_parts, format('cm.revenue_k < %s', p_revenue_max)); END IF;
  IF p_revenue_exclude_null IS TRUE THEN
    v_parts := array_append(v_parts, 'cm.revenue_k IS NOT NULL');
    v_conds := array_append(v_conds, '(' || array_to_string(v_parts, ' AND ') || ')');
  ELSIF p_revenue_include_null IS TRUE AND array_length(v_parts, 1) IS NOT NULL THEN
    v_conds := array_append(v_conds, '((' || array_to_string(v_parts, ' AND ') || ') OR cm.revenue_k IS NULL)');
  ELSIF array_length(v_parts, 1) IS NOT NULL THEN v_conds := v_conds || v_parts; END IF;

  v_parts := '{}';
  IF p_net_income_min IS NOT NULL THEN v_parts := array_append(v_parts, format('cm.net_income_k >= %s', p_net_income_min)); END IF;
  IF p_net_income_max IS NOT NULL THEN v_parts := array_append(v_parts, format('cm.net_income_k < %s', p_net_income_max)); END IF;
  IF p_net_income_exclude_null IS TRUE THEN
    v_parts := array_append(v_parts, 'cm.net_income_k IS NOT NULL');
    v_conds := array_append(v_conds, '(' || array_to_string(v_parts, ' AND ') || ')');
  ELSIF p_net_income_include_null IS TRUE AND array_length(v_parts, 1) IS NOT NULL THEN
    v_conds := array_append(v_conds, '((' || array_to_string(v_parts, ' AND ') || ') OR cm.net_income_k IS NULL)');
  ELSIF array_length(v_parts, 1) IS NOT NULL THEN v_conds := v_conds || v_parts; END IF;

  v_parts := '{}';
  IF p_age_min IS NOT NULL THEN v_parts := array_append(v_parts, format('cm.representative_age >= %s', p_age_min)); END IF;
  IF p_age_max IS NOT NULL THEN v_parts := array_append(v_parts, format('cm.representative_age < %s', p_age_max)); END IF;
  IF p_age_exclude_null IS TRUE THEN
    v_parts := array_append(v_parts, 'cm.representative_age IS NOT NULL');
    v_conds := array_append(v_conds, '(' || array_to_string(v_parts, ' AND ') || ')');
  ELSIF p_age_include_null IS TRUE AND array_length(v_parts, 1) IS NOT NULL THEN
    v_conds := array_append(v_conds, '((' || array_to_string(v_parts, ' AND ') || ') OR cm.representative_age IS NULL)');
  ELSIF array_length(v_parts, 1) IS NOT NULL THEN v_conds := v_conds || v_parts; END IF;

  v_parts := '{}';
  IF p_employee_min IS NOT NULL THEN v_parts := array_append(v_parts, format('cm.employee_count >= %s', p_employee_min)); END IF;
  IF p_employee_max IS NOT NULL THEN v_parts := array_append(v_parts, format('cm.employee_count < %s', p_employee_max)); END IF;
  IF p_employee_exclude_null IS TRUE THEN
    v_parts := array_append(v_parts, 'cm.employee_count IS NOT NULL');
    v_conds := array_append(v_conds, '(' || array_to_string(v_parts, ' AND ') || ')');
  ELSIF p_employee_include_null IS TRUE AND array_length(v_parts, 1) IS NOT NULL THEN
    v_conds := array_append(v_conds, '((' || array_to_string(v_parts, ' AND ') || ') OR cm.employee_count IS NULL)');
  ELSIF array_length(v_parts, 1) IS NOT NULL THEN v_conds := v_conds || v_parts; END IF;

  IF p_phone_pattern IS NOT NULL THEN v_conds := v_conds || format('cm.phone LIKE %L || ''%%''', p_phone_pattern); END IF;
  IF p_established_min IS NOT NULL THEN v_conds := v_conds || format('cm.established_year >= %s', p_established_min); END IF;
  IF p_established_max IS NOT NULL THEN v_conds := v_conds || format('cm.established_year < %s', p_established_max); END IF;

  IF p_shareholder_type_arr IS NOT NULL THEN
    IF array_length(p_shareholder_type_arr, 1) = 1 THEN
      v_conds := v_conds || format('classify_shareholder_type(cm.shareholders) = %L', p_shareholder_type_arr[1]);
    ELSE
      v_conds := v_conds || format('classify_shareholder_type(cm.shareholders) = ANY(%L::TEXT[])', p_shareholder_type_arr);
    END IF;
  END IF;

  IF p_rep_shareholder_match IS TRUE THEN
    v_conds := array_append(v_conds,
      'cm.representative IS NOT NULL AND cm.shareholders IS NOT NULL AND replace(replace(cm.shareholders, ''　'', ''''), '' '', '''') LIKE ''%%'' || replace(replace(cm.representative, ''　'', ''''), '' '', '''') || ''%%''');
  END IF;

  IF array_length(v_conds, 1) IS NULL THEN v_where := 'TRUE';
  ELSE v_where := array_to_string(v_conds, v_joiner); END IF;

  EXECUTE 'SELECT count(*) FROM company_master cm WHERE ' || v_where INTO v_count;
  IF v_count = 0 THEN RETURN; END IF;

  -- 中規模ヒット (<=100K) では ORDER BY id ASC LIMIT N の planner 誤選択
  -- (PK index walk + filter で14万行スキャン→16〜23秒タイムアウト) を回避するため、
  -- index scan を function スコープで切って Bitmap Heap Scan を強制する。
  -- 100K超は逆に bitmap マテリアライズコストが大きいので index scan を許可。
  IF v_count <= 100000 THEN
    PERFORM set_config('enable_indexscan', 'off', true);
    PERFORM set_config('enable_indexonlyscan', 'off', true);
  END IF;

  RETURN QUERY EXECUTE format(
    $q$SELECT cm.id, cm.company_name, cm.business_description, cm.postal_code,
      cm.prefecture, cm.city, cm.address, cm.full_address,
      cm.revenue_k, cm.net_income_k, cm.ordinary_income_k, cm.capital_k,
      cm.established_year, cm.representative, cm.representative_age,
      cm.employee_count, cm.industry_major, cm.industry_sub, cm.phone,
      cm.tsr_id, cm.remarks, cm.source_file, cm.shareholders, cm.officers,
      cm.clients, %s::BIGINT AS total_count
    FROM company_master cm WHERE %s ORDER BY %s LIMIT %s OFFSET %s * %s$q$,
    v_count, v_where, v_order, p_page_size, p_page, p_page_size);
END;
$function$;
