-- 株主分類ヘルパー関数 + RPC関数にp_shareholder_type追加

CREATE OR REPLACE FUNCTION classify_shareholder_type(shareholders TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN shareholders IS NULL THEN 'empty'
    WHEN shareholders !~ '[ァ-ヴー]{3}|[Ａ-Ｚａ-ｚ]|株式会社|有限会社|合同会社|合資会社|持株会|組合|信用金庫|社団法人|財団法人|協会|公社|機構|工業|産業|商事|物流|運輸|建設|製作所|ホールディングス|グループ|不動産|電気|電機|化学|製薬|食品|印刷|通運|海運|倉庫|鉄道|電力|証券|保険|銀行|金属|鋼|セメント|紡績|繊維|石油|投資育成|自動車|百貨店|機械|製造|事務所|研究所|水産|薬品|塗料|樹脂|興業|販売|醸造|鋳造|・'
      THEN 'individual'
    WHEN EXISTS (
      SELECT 1 FROM unnest(string_to_array(shareholders, '，')) p
      WHERE split_part(p, '（', 1) !~ '[ァ-ヴー]{3}|[Ａ-Ｚａ-ｚ]|株式会社|有限会社|合同会社|合資会社|持株会|組合|信用金庫|社団法人|財団法人|協会|公社|機構|工業|産業|商事|物流|運輸|建設|製作所|ホールディングス|グループ|不動産|電気|電機|化学|製薬|食品|印刷|通運|海運|倉庫|鉄道|電力|証券|保険|銀行|金属|鋼|セメント|紡績|繊維|石油|投資育成|自動車|百貨店|機械|製造|事務所|研究所|水産|薬品|塗料|樹脂|興業|販売|醸造|鋳造|・'
      AND length(split_part(p, '（', 1)) <= 6
    ) THEN 'mixed'
    ELSE 'corporate'
  END;
$$;

DROP FUNCTION IF EXISTS search_company_master(text,text[],text[],text[],text,bigint,bigint,smallint,smallint,integer,integer,text,smallint,smallint,text,text,text,integer,integer);

CREATE OR REPLACE FUNCTION search_company_master(
  p_keyword         TEXT     DEFAULT NULL,
  p_daibunrui_arr   TEXT[]   DEFAULT NULL,
  p_saibunrui_arr   TEXT[]   DEFAULT NULL,
  p_prefecture_arr  TEXT[]   DEFAULT NULL,
  p_city            TEXT     DEFAULT NULL,
  p_revenue_min     BIGINT   DEFAULT NULL,
  p_revenue_max     BIGINT   DEFAULT NULL,
  p_age_min         SMALLINT DEFAULT NULL,
  p_age_max         SMALLINT DEFAULT NULL,
  p_employee_min    INT      DEFAULT NULL,
  p_employee_max    INT      DEFAULT NULL,
  p_phone_pattern   TEXT     DEFAULT NULL,
  p_established_min SMALLINT DEFAULT NULL,
  p_established_max SMALLINT DEFAULT NULL,
  p_shareholder_type TEXT    DEFAULT NULL,
  p_logic           TEXT     DEFAULT 'AND',
  p_sort_col        TEXT     DEFAULT NULL,
  p_sort_dir        TEXT     DEFAULT 'asc',
  p_page            INT      DEFAULT 0,
  p_page_size       INT      DEFAULT 50
)
RETURNS TABLE (
  id BIGINT, company_name TEXT, business_description TEXT, postal_code TEXT,
  prefecture TEXT, city TEXT, address TEXT, full_address TEXT,
  revenue_k BIGINT, net_income_k BIGINT, ordinary_income_k BIGINT, capital_k BIGINT,
  established_year SMALLINT, representative TEXT, representative_age SMALLINT,
  employee_count INTEGER, industry_major TEXT, industry_sub TEXT, phone TEXT,
  tsr_id TEXT, remarks TEXT, source_file TEXT, shareholders TEXT, officers TEXT,
  clients TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_sort    TEXT := LOWER(COALESCE(p_sort_col, ''));
  v_dir     TEXT := CASE WHEN LOWER(COALESCE(p_sort_dir,'asc')) = 'desc' THEN 'DESC' ELSE 'ASC' END;
  v_order   TEXT;
  v_is_or   BOOLEAN := (UPPER(COALESCE(p_logic, 'AND')) = 'OR');
  v_joiner  TEXT;
  v_conds   TEXT[] := '{}';
  v_where   TEXT;
  v_count   BIGINT;
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
    IF array_length(p_daibunrui_arr, 1) = 1 THEN
      v_conds := v_conds || format('cm.industry_major = %L', p_daibunrui_arr[1]);
    ELSE
      v_conds := v_conds || format('cm.industry_major = ANY(%L::TEXT[])', p_daibunrui_arr);
    END IF;
  END IF;

  IF p_saibunrui_arr IS NOT NULL THEN
    IF array_length(p_saibunrui_arr, 1) = 1 THEN
      v_conds := v_conds || format('cm.industry_sub = %L', p_saibunrui_arr[1]);
    ELSE
      v_conds := v_conds || format('cm.industry_sub = ANY(%L::TEXT[])', p_saibunrui_arr);
    END IF;
  END IF;

  IF p_prefecture_arr IS NOT NULL THEN
    IF array_length(p_prefecture_arr, 1) = 1 THEN
      v_conds := v_conds || format('cm.prefecture = %L', p_prefecture_arr[1]);
    ELSE
      v_conds := v_conds || format('cm.prefecture = ANY(%L::TEXT[])', p_prefecture_arr);
    END IF;
  END IF;

  IF p_city IS NOT NULL THEN
    v_conds := v_conds || format('cm.city ILIKE %L || ''%%''', p_city);
  END IF;

  IF p_revenue_min IS NOT NULL THEN
    v_conds := v_conds || format('cm.revenue_k >= %s', p_revenue_min);
  END IF;
  IF p_revenue_max IS NOT NULL THEN
    v_conds := v_conds || format('cm.revenue_k <= %s', p_revenue_max);
  END IF;
  IF p_age_min IS NOT NULL THEN
    v_conds := v_conds || format('cm.representative_age >= %s', p_age_min);
  END IF;
  IF p_age_max IS NOT NULL THEN
    v_conds := v_conds || format('cm.representative_age <= %s', p_age_max);
  END IF;
  IF p_employee_min IS NOT NULL THEN
    v_conds := v_conds || format('cm.employee_count >= %s', p_employee_min);
  END IF;
  IF p_employee_max IS NOT NULL THEN
    v_conds := v_conds || format('cm.employee_count <= %s', p_employee_max);
  END IF;
  IF p_phone_pattern IS NOT NULL THEN
    v_conds := v_conds || format('cm.phone LIKE %L || ''%%''', p_phone_pattern);
  END IF;
  IF p_established_min IS NOT NULL THEN
    v_conds := v_conds || format('cm.established_year >= %s', p_established_min);
  END IF;
  IF p_established_max IS NOT NULL THEN
    v_conds := v_conds || format('cm.established_year <= %s', p_established_max);
  END IF;

  -- 株主タイプフィルタ
  IF p_shareholder_type IS NOT NULL THEN
    v_conds := v_conds || format('classify_shareholder_type(cm.shareholders) = %L', p_shareholder_type);
  END IF;

  IF array_length(v_conds, 1) IS NULL THEN
    v_where := 'TRUE';
  ELSE
    v_where := array_to_string(v_conds, v_joiner);
  END IF;

  EXECUTE 'SELECT count(*) FROM company_master cm WHERE ' || v_where
  INTO v_count;

  IF v_count = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    $q$
    SELECT
      cm.id, cm.company_name, cm.business_description, cm.postal_code,
      cm.prefecture, cm.city, cm.address, cm.full_address,
      cm.revenue_k, cm.net_income_k, cm.ordinary_income_k, cm.capital_k,
      cm.established_year, cm.representative, cm.representative_age,
      cm.employee_count, cm.industry_major, cm.industry_sub, cm.phone,
      cm.tsr_id, cm.remarks, cm.source_file, cm.shareholders, cm.officers,
      cm.clients,
      %s::BIGINT AS total_count
    FROM company_master cm
    WHERE %s
    ORDER BY %s
    LIMIT %s OFFSET %s * %s
    $q$,
    v_count, v_where, v_order, p_page_size, p_page, p_page_size
  );
END;
$$;
