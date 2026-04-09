-- search_company_master の city フィルタを完全一致から前方一致に変更
-- 「福岡市」で絞ると「福岡市中央区」等を含む区入りレコードが除外され、
-- 区なしの33件しかヒットしない不具合を修正
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
  total_count BIGINT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_logic TEXT := COALESCE(UPPER(p_logic), 'AND');
  v_sort  TEXT := LOWER(COALESCE(p_sort_col, ''));
  v_dir   TEXT := CASE WHEN LOWER(COALESCE(p_sort_dir,'asc')) = 'desc' THEN 'DESC' ELSE 'ASC' END;
  v_order TEXT;
BEGIN
  v_order := CASE v_sort
    WHEN 'company_name'      THEN 'cm.company_name '      || v_dir
    WHEN 'revenue_k'         THEN 'cm.revenue_k '         || v_dir || ' NULLS LAST'
    WHEN 'net_income_k'      THEN 'cm.net_income_k '      || v_dir || ' NULLS LAST'
    WHEN 'ordinary_income_k' THEN 'cm.ordinary_income_k ' || v_dir || ' NULLS LAST'
    WHEN 'capital_k'         THEN 'cm.capital_k '         || v_dir || ' NULLS LAST'
    WHEN 'established_year'  THEN 'cm.established_year '  || v_dir || ' NULLS LAST'
    WHEN 'employee_count'    THEN 'cm.employee_count '    || v_dir || ' NULLS LAST'
    WHEN 'representative_age' THEN 'cm.representative_age ' || v_dir || ' NULLS LAST'
    WHEN 'prefecture'        THEN 'cm.prefecture '        || v_dir
    WHEN 'industry_major'    THEN 'cm.industry_major '    || v_dir
    ELSE 'cm.id ASC'
  END;

  RETURN QUERY EXECUTE format($q$
    SELECT
      cm.id, cm.company_name, cm.business_description, cm.postal_code,
      cm.prefecture, cm.city, cm.address, cm.full_address,
      cm.revenue_k, cm.net_income_k, cm.ordinary_income_k, cm.capital_k,
      cm.established_year, cm.representative, cm.representative_age,
      cm.employee_count, cm.industry_major, cm.industry_sub, cm.phone,
      cm.tsr_id, cm.remarks, cm.source_file, cm.shareholders, cm.officers,
      count(*) OVER() AS total_count
    FROM company_master cm
    WHERE
      CASE WHEN $1 = 'OR' THEN (
        ($2 IS NOT NULL AND (cm.company_name ILIKE '%%' || $2 || '%%' OR cm.business_description ILIKE '%%' || $2 || '%%')) OR
        ($3 IS NOT NULL AND cm.industry_major = ANY($3)) OR
        ($4 IS NOT NULL AND cm.industry_sub = ANY($4)) OR
        ($5 IS NOT NULL AND cm.prefecture = ANY($5)) OR
        ($6 IS NOT NULL AND cm.city ILIKE $6 || '%%') OR
        ($7 IS NOT NULL AND cm.revenue_k >= $7) OR
        ($8 IS NOT NULL AND cm.revenue_k <= $8) OR
        ($9 IS NOT NULL AND cm.representative_age >= $9) OR
        ($10 IS NOT NULL AND cm.representative_age <= $10) OR
        ($11 IS NOT NULL AND cm.employee_count >= $11) OR
        ($12 IS NOT NULL AND cm.employee_count <= $12) OR
        ($13 IS NOT NULL AND cm.phone LIKE $13 || '%%') OR
        ($14 IS NOT NULL AND cm.established_year >= $14) OR
        ($15 IS NOT NULL AND cm.established_year <= $15)
      ) ELSE (
        ($2 IS NULL OR (cm.company_name ILIKE '%%' || $2 || '%%' OR cm.business_description ILIKE '%%' || $2 || '%%'))
        AND ($3 IS NULL OR cm.industry_major = ANY($3))
        AND ($4 IS NULL OR cm.industry_sub = ANY($4))
        AND ($5 IS NULL OR cm.prefecture = ANY($5))
        AND ($6 IS NULL OR cm.city ILIKE $6 || '%%')
        AND ($7 IS NULL OR cm.revenue_k >= $7)
        AND ($8 IS NULL OR cm.revenue_k <= $8)
        AND ($9 IS NULL OR cm.representative_age >= $9)
        AND ($10 IS NULL OR cm.representative_age <= $10)
        AND ($11 IS NULL OR cm.employee_count >= $11)
        AND ($12 IS NULL OR cm.employee_count <= $12)
        AND ($13 IS NULL OR cm.phone LIKE $13 || '%%')
        AND ($14 IS NULL OR cm.established_year >= $14)
        AND ($15 IS NULL OR cm.established_year <= $15)
      ) END
    ORDER BY %s
    LIMIT $16 OFFSET $17 * $16
  $q$, v_order)
  USING v_logic, p_keyword, p_daibunrui_arr, p_saibunrui_arr, p_prefecture_arr,
        p_city, p_revenue_min, p_revenue_max, p_age_min, p_age_max,
        p_employee_min, p_employee_max, p_phone_pattern, p_established_min, p_established_max,
        p_page_size, p_page;
END;
$$;
