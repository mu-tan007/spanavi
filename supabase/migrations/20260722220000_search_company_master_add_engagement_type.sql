-- 企業DB検索に「タイプ(engagement)」抽出を追加（p_call_engagement_arr）。商材(category)と併用可。
-- （前段: 架電ステータス×商材 も同RPC。p_db_label_arr を末尾に追加）
-- p_call_category_arr（商材=category_id の配列、複数選択）を受け、
-- 架電ステータス条件を商材スコープで評価する。
--   ・商材＋ステータス: その商材で当該ステータス（'未登録'=その商材のどのリストにも無し）
--   ・商材のみ:         その商材に登録あり
--   ・ステータスのみ:   従来通り全商材横断
set local search_path = public, extensions;

drop function if exists public.search_company_master(
  text, text[], text[], text[], text, bigint, bigint, boolean, boolean, bigint, bigint,
  boolean, boolean, smallint, smallint, boolean, boolean, integer, integer, boolean, boolean,
  text, smallint, smallint, text[], boolean, text, text, text, integer, integer, text[],
  vector, boolean, text[], text[], text[], text[], text[]);

CREATE OR REPLACE FUNCTION public.search_company_master(
  p_keyword text DEFAULT NULL::text, p_daibunrui_arr text[] DEFAULT NULL::text[], p_saibunrui_arr text[] DEFAULT NULL::text[], p_prefecture_arr text[] DEFAULT NULL::text[], p_city text DEFAULT NULL::text, p_revenue_min bigint DEFAULT NULL::bigint, p_revenue_max bigint DEFAULT NULL::bigint, p_revenue_include_null boolean DEFAULT NULL::boolean, p_revenue_exclude_null boolean DEFAULT NULL::boolean, p_net_income_min bigint DEFAULT NULL::bigint, p_net_income_max bigint DEFAULT NULL::bigint, p_net_income_include_null boolean DEFAULT NULL::boolean, p_net_income_exclude_null boolean DEFAULT NULL::boolean, p_age_min smallint DEFAULT NULL::smallint, p_age_max smallint DEFAULT NULL::smallint, p_age_include_null boolean DEFAULT NULL::boolean, p_age_exclude_null boolean DEFAULT NULL::boolean, p_employee_min integer DEFAULT NULL::integer, p_employee_max integer DEFAULT NULL::integer, p_employee_include_null boolean DEFAULT NULL::boolean, p_employee_exclude_null boolean DEFAULT NULL::boolean, p_phone_pattern text DEFAULT NULL::text, p_established_min smallint DEFAULT NULL::smallint, p_established_max smallint DEFAULT NULL::smallint, p_shareholder_type_arr text[] DEFAULT NULL::text[], p_rep_shareholder_match boolean DEFAULT NULL::boolean, p_logic text DEFAULT 'AND'::text, p_sort_col text DEFAULT NULL::text, p_sort_dir text DEFAULT 'asc'::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_keyword_arr text[] DEFAULT NULL::text[], p_query_embedding vector DEFAULT NULL::vector, p_industry_or_mode boolean DEFAULT false, p_city_arr text[] DEFAULT NULL::text[], p_phone_patterns text[] DEFAULT NULL::text[], p_call_status_arr text[] DEFAULT NULL::text[], p_call_category_arr text[] DEFAULT NULL::text[], p_db_label_arr text[] DEFAULT NULL::text[], p_call_engagement_arr text[] DEFAULT NULL::text[])
 RETURNS TABLE(id bigint, company_name text, business_description text, postal_code text, prefecture text, city text, address text, full_address text, revenue_k bigint, net_income_k bigint, ordinary_income_k bigint, capital_k bigint, established_year smallint, representative text, representative_age smallint, employee_count integer, industry_major text, industry_sub text, phone text, tsr_id text, remarks text, source_file text, shareholders text, officers text, clients text, total_count bigint)
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
  v_kw      TEXT;
  v_kw_parts TEXT[];
  v_or_parts TEXT[];
  v_city_parts TEXT[];
  v_phone_parts TEXT[];
  v_c       TEXT;
  v_p       TEXT;
  v_use_semantic BOOLEAN := (p_query_embedding IS NOT NULL);
  v_org     uuid := public.get_user_org_id();
  v_cs_sel  TEXT[];
  v_cs_unreg BOOLEAN;
  v_cs_frag TEXT;
  v_cat_filter TEXT;
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

  IF p_industry_or_mode IS TRUE
     AND (p_saibunrui_arr IS NOT NULL OR p_keyword_arr IS NOT NULL) THEN
    v_or_parts := '{}';
    IF p_saibunrui_arr IS NOT NULL AND array_length(p_saibunrui_arr, 1) >= 1 THEN
      IF array_length(p_saibunrui_arr, 1) = 1 THEN
        v_or_parts := array_append(v_or_parts, format('cm.industry_sub = %L', p_saibunrui_arr[1]));
      ELSE
        v_or_parts := array_append(v_or_parts, format('cm.industry_sub = ANY(%L::TEXT[])', p_saibunrui_arr));
      END IF;
    END IF;
    IF p_keyword_arr IS NOT NULL AND array_length(p_keyword_arr, 1) >= 1 THEN
      FOREACH v_kw IN ARRAY p_keyword_arr LOOP
        v_or_parts := array_append(v_or_parts, format(
          $f$(cm.company_name ILIKE '%%' || %L || '%%' OR cm.business_description ILIKE '%%' || %L || '%%')$f$,
          v_kw, v_kw));
      END LOOP;
    END IF;
    IF array_length(v_or_parts, 1) >= 1 THEN
      v_conds := v_conds || ('(' || array_to_string(v_or_parts, ' OR ') || ')');
    END IF;
  ELSE
    IF p_keyword_arr IS NOT NULL AND array_length(p_keyword_arr, 1) >= 1 THEN
      v_kw_parts := '{}';
      FOREACH v_kw IN ARRAY p_keyword_arr LOOP
        v_kw_parts := array_append(v_kw_parts, format(
          $f$(cm.company_name ILIKE '%%' || %L || '%%' OR cm.business_description ILIKE '%%' || %L || '%%')$f$,
          v_kw, v_kw));
      END LOOP;
      v_conds := v_conds || ('(' || array_to_string(v_kw_parts, ' OR ') || ')');
    END IF;
    IF p_saibunrui_arr IS NOT NULL THEN
      IF array_length(p_saibunrui_arr, 1) = 1 THEN v_conds := v_conds || format('cm.industry_sub = %L', p_saibunrui_arr[1]);
      ELSE v_conds := v_conds || format('cm.industry_sub = ANY(%L::TEXT[])', p_saibunrui_arr); END IF;
    END IF;
  END IF;

  IF p_daibunrui_arr IS NOT NULL THEN
    IF array_length(p_daibunrui_arr, 1) = 1 THEN v_conds := v_conds || format('cm.industry_major = %L', p_daibunrui_arr[1]);
    ELSE v_conds := v_conds || format('cm.industry_major = ANY(%L::TEXT[])', p_daibunrui_arr); END IF;
  END IF;
  IF p_prefecture_arr IS NOT NULL THEN
    IF array_length(p_prefecture_arr, 1) = 1 THEN v_conds := v_conds || format('cm.prefecture = %L', p_prefecture_arr[1]);
    ELSE v_conds := v_conds || format('cm.prefecture = ANY(%L::TEXT[])', p_prefecture_arr); END IF;
  END IF;

  IF p_city IS NOT NULL THEN v_conds := v_conds || format('cm.city ILIKE %L || ''%%''', p_city); END IF;
  IF p_city_arr IS NOT NULL AND array_length(p_city_arr, 1) >= 1 THEN
    v_city_parts := '{}';
    FOREACH v_c IN ARRAY p_city_arr LOOP
      v_city_parts := array_append(v_city_parts, format('cm.city ILIKE %L || ''%%''', v_c));
    END LOOP;
    v_conds := v_conds || ('(' || array_to_string(v_city_parts, ' OR ') || ')');
  END IF;

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
  IF p_phone_patterns IS NOT NULL AND array_length(p_phone_patterns, 1) >= 1 THEN
    v_phone_parts := '{}';
    FOREACH v_p IN ARRAY p_phone_patterns LOOP
      v_phone_parts := array_append(v_phone_parts, format('cm.phone LIKE %L || ''%%''', v_p));
    END LOOP;
    v_conds := v_conds || ('(' || array_to_string(v_phone_parts, ' OR ') || ')');
  END IF;

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
      'cm.representative IS NOT NULL AND cm.shareholders IS NOT NULL AND replace(replace(cm.shareholders, ''　'', ''''), '' '', '''') LIKE ''%'' || replace(replace(cm.representative, ''　'', ''''), '' '', '''') || ''%''');
  END IF;

  -- 架電ステータス × 商材 抽出（企業DB×リスト架電履歴の横断。企業名＋電話一致でMVと突合）
  IF (p_call_status_arr IS NOT NULL OR p_call_category_arr IS NOT NULL OR p_call_engagement_arr IS NOT NULL) AND v_org IS NOT NULL THEN
    v_cat_filter := '';
    IF p_call_category_arr IS NOT NULL AND array_length(p_call_category_arr, 1) >= 1 THEN
      v_cat_filter := v_cat_filter || format(' AND m.category_id = ANY(%L::uuid[])', p_call_category_arr);
    END IF;
    IF p_call_engagement_arr IS NOT NULL AND array_length(p_call_engagement_arr, 1) >= 1 THEN
      v_cat_filter := v_cat_filter || format(' AND m.engagement_id = ANY(%L::uuid[])', p_call_engagement_arr);
    END IF;

    v_cs_frag := NULL;

    IF p_call_status_arr IS NOT NULL AND array_length(p_call_status_arr, 1) >= 1 THEN
      v_cs_sel := ARRAY(SELECT x FROM unnest(p_call_status_arr) AS x WHERE x <> '未登録');
      v_cs_unreg := ('未登録' = ANY(p_call_status_arr));

      IF array_length(v_cs_sel, 1) >= 1 THEN
        v_cs_frag := format(
          $f$EXISTS (SELECT 1 FROM public.mv_company_call_status m WHERE m.org_id = %L::uuid AND m.status_label = ANY(%L::text[])%s AND m.company_master_id = cm.id)$f$,
          v_org, v_cs_sel, v_cat_filter);
      END IF;

      IF v_cs_unreg THEN
        v_cs_frag := COALESCE(v_cs_frag || ' OR ', '') || format(
          $f$NOT EXISTS (SELECT 1 FROM public.mv_company_call_status m WHERE m.org_id = %L::uuid%s AND m.company_master_id = cm.id)$f$,
          v_org, v_cat_filter);
      END IF;
    ELSE
      -- 商材のみ選択（ステータス未選択）→ その商材に登録あり
      v_cs_frag := format(
        $f$EXISTS (SELECT 1 FROM public.mv_company_call_status m WHERE m.org_id = %L::uuid%s AND m.company_master_id = cm.id)$f$,
        v_org, v_cat_filter);
    END IF;

    IF v_cs_frag IS NOT NULL THEN
      v_conds := v_conds || ('(' || v_cs_frag || ')');
    END IF;
  END IF;

  -- 企業DBラベル抽出（company_db_labels: 'M&Aニーズあり' 等）
  IF p_db_label_arr IS NOT NULL AND array_length(p_db_label_arr, 1) >= 1 AND v_org IS NOT NULL THEN
    v_conds := v_conds || format(
      $f$EXISTS (SELECT 1 FROM public.company_db_labels dl WHERE dl.org_id = %L::uuid AND dl.label = ANY(%L::text[]) AND dl.company_master_id = cm.id)$f$,
      v_org, p_db_label_arr);
  END IF;

  IF v_use_semantic THEN
    v_conds := array_append(v_conds, 'cm.embedding IS NOT NULL');
  END IF;

  IF array_length(v_conds, 1) IS NULL THEN v_where := 'TRUE';
  ELSE v_where := array_to_string(v_conds, v_joiner); END IF;

  EXECUTE 'SELECT count(*) FROM company_master cm WHERE ' || v_where INTO v_count;
  IF v_count = 0 THEN RETURN; END IF;

  IF NOT v_use_semantic AND v_count <= 100000 AND p_rep_shareholder_match IS NOT TRUE THEN
    PERFORM set_config('enable_indexscan', 'off', true);
    PERFORM set_config('enable_indexonlyscan', 'off', true);
  END IF;

  IF v_use_semantic THEN
    RETURN QUERY EXECUTE format(
      $q$SELECT cm.id, cm.company_name, cm.business_description, cm.postal_code,
        cm.prefecture, cm.city, cm.address, cm.full_address,
        cm.revenue_k, cm.net_income_k, cm.ordinary_income_k, cm.capital_k,
        cm.established_year, cm.representative, cm.representative_age,
        cm.employee_count, cm.industry_major, cm.industry_sub, cm.phone,
        cm.tsr_id, cm.remarks, cm.source_file, cm.shareholders, cm.officers,
        cm.clients, %s::BIGINT AS total_count
      FROM company_master cm WHERE %s
      ORDER BY cm.embedding <=> %L::vector ASC
      LIMIT %s OFFSET %s * %s$q$,
      v_count, v_where, p_query_embedding::text, p_page_size, p_page, p_page_size);
  ELSE
    RETURN QUERY EXECUTE format(
      $q$WITH selected AS (
        SELECT cm.id FROM company_master cm WHERE %s ORDER BY %s LIMIT %s OFFSET %s * %s
      )
      SELECT cm.id, cm.company_name, cm.business_description, cm.postal_code,
        cm.prefecture, cm.city, cm.address, cm.full_address,
        cm.revenue_k, cm.net_income_k, cm.ordinary_income_k, cm.capital_k,
        cm.established_year, cm.representative, cm.representative_age,
        cm.employee_count, cm.industry_major, cm.industry_sub, cm.phone,
        cm.tsr_id, cm.remarks, cm.source_file, cm.shareholders, cm.officers,
        cm.clients, %s::BIGINT AS total_count
      FROM company_master cm
      JOIN selected USING (id)
      ORDER BY %s$q$,
      v_where, v_order, p_page_size, p_page, p_page_size, v_count, v_order);
  END IF;
END;
$function$;