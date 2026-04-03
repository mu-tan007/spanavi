-- ============================================================
-- company_master: 東京商工リサーチ企業データベース (482,958社)
-- ============================================================

-- trigram extension for fuzzy/prefix text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Main table
CREATE TABLE company_master (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_name       TEXT NOT NULL,
  business_description TEXT,
  postal_code        TEXT,
  prefecture         TEXT,
  city               TEXT,
  address            TEXT,
  full_address       TEXT,
  revenue_k          BIGINT,
  net_income_k       BIGINT,
  ordinary_income_k  BIGINT,
  capital_k          BIGINT,
  established_year   SMALLINT,
  representative     TEXT,
  representative_age SMALLINT,
  employee_count     INTEGER,
  industry_major     TEXT,
  industry_sub       TEXT,
  phone              TEXT,
  tsr_id             TEXT,
  remarks            TEXT,
  source_file        TEXT,
  shareholders       TEXT,
  officers           TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Category lookup for incremental search
CREATE TABLE tsr_category_master (
  id         SERIAL PRIMARY KEY,
  daibunrui  TEXT NOT NULL,
  saibunrui  TEXT NOT NULL
);

-- ============================================================
-- Indexes for 483K row performance
-- ============================================================

-- Text search (trigram)
CREATE INDEX idx_cm_name_trgm ON company_master USING gin (company_name gin_trgm_ops);
CREATE INDEX idx_cm_desc_trgm ON company_master USING gin (business_description gin_trgm_ops);
CREATE INDEX idx_cm_phone_trgm ON company_master USING gin (phone gin_trgm_ops);

-- Category filters
CREATE INDEX idx_cm_industry_major ON company_master (industry_major);
CREATE INDEX idx_cm_industry_sub ON company_master (industry_sub);

-- Range filters (partial index excludes nulls)
CREATE INDEX idx_cm_revenue ON company_master (revenue_k) WHERE revenue_k IS NOT NULL;
CREATE INDEX idx_cm_age ON company_master (representative_age) WHERE representative_age IS NOT NULL;
CREATE INDEX idx_cm_employee ON company_master (employee_count) WHERE employee_count IS NOT NULL;
CREATE INDEX idx_cm_established ON company_master (established_year) WHERE established_year IS NOT NULL;

-- Area filters
CREATE INDEX idx_cm_prefecture ON company_master (prefecture);
CREATE INDEX idx_cm_pref_city ON company_master (prefecture, city);

-- Dedup
CREATE UNIQUE INDEX idx_cm_tsr_id ON company_master (tsr_id) WHERE tsr_id IS NOT NULL;

-- Category master
CREATE INDEX idx_tcm_daibunrui ON tsr_category_master (daibunrui);

-- ============================================================
-- RLS: read-only for all authenticated users
-- ============================================================

ALTER TABLE company_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm_select_auth" ON company_master
  FOR SELECT TO authenticated USING (true);

ALTER TABLE tsr_category_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tcm_select_auth" ON tsr_category_master
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- RPC: server-side filtered search with pagination
-- ============================================================

CREATE OR REPLACE FUNCTION search_company_master(
  p_keyword       TEXT    DEFAULT NULL,
  p_daibunrui     TEXT    DEFAULT NULL,
  p_saibunrui     TEXT    DEFAULT NULL,
  p_prefecture    TEXT    DEFAULT NULL,
  p_city          TEXT    DEFAULT NULL,
  p_revenue_min   BIGINT  DEFAULT NULL,
  p_revenue_max   BIGINT  DEFAULT NULL,
  p_age_min       SMALLINT DEFAULT NULL,
  p_age_max       SMALLINT DEFAULT NULL,
  p_employee_min  INT     DEFAULT NULL,
  p_employee_max  INT     DEFAULT NULL,
  p_phone_pattern TEXT    DEFAULT NULL,
  p_established_min SMALLINT DEFAULT NULL,
  p_established_max SMALLINT DEFAULT NULL,
  p_page          INT     DEFAULT 0,
  p_page_size     INT     DEFAULT 50
)
RETURNS TABLE (
  id                BIGINT,
  company_name      TEXT,
  business_description TEXT,
  postal_code       TEXT,
  prefecture        TEXT,
  city              TEXT,
  address           TEXT,
  full_address      TEXT,
  revenue_k         BIGINT,
  net_income_k      BIGINT,
  ordinary_income_k BIGINT,
  capital_k         BIGINT,
  established_year  SMALLINT,
  representative    TEXT,
  representative_age SMALLINT,
  employee_count    INTEGER,
  industry_major    TEXT,
  industry_sub      TEXT,
  phone             TEXT,
  tsr_id            TEXT,
  remarks           TEXT,
  source_file       TEXT,
  shareholders      TEXT,
  officers          TEXT,
  total_count       BIGINT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.company_name,
    cm.business_description,
    cm.postal_code,
    cm.prefecture,
    cm.city,
    cm.address,
    cm.full_address,
    cm.revenue_k,
    cm.net_income_k,
    cm.ordinary_income_k,
    cm.capital_k,
    cm.established_year,
    cm.representative,
    cm.representative_age,
    cm.employee_count,
    cm.industry_major,
    cm.industry_sub,
    cm.phone,
    cm.tsr_id,
    cm.remarks,
    cm.source_file,
    cm.shareholders,
    cm.officers,
    count(*) OVER() AS total_count
  FROM company_master cm
  WHERE
    (p_keyword IS NULL OR
      cm.company_name ILIKE '%' || p_keyword || '%' OR
      cm.business_description ILIKE '%' || p_keyword || '%')
    AND (p_daibunrui IS NULL OR cm.industry_major = p_daibunrui)
    AND (p_saibunrui IS NULL OR cm.industry_sub = p_saibunrui)
    AND (p_prefecture IS NULL OR cm.prefecture = p_prefecture)
    AND (p_city IS NULL OR cm.city = p_city)
    AND (p_revenue_min IS NULL OR cm.revenue_k >= p_revenue_min)
    AND (p_revenue_max IS NULL OR cm.revenue_k <= p_revenue_max)
    AND (p_age_min IS NULL OR cm.representative_age >= p_age_min)
    AND (p_age_max IS NULL OR cm.representative_age <= p_age_max)
    AND (p_employee_min IS NULL OR cm.employee_count >= p_employee_min)
    AND (p_employee_max IS NULL OR cm.employee_count <= p_employee_max)
    AND (p_phone_pattern IS NULL OR cm.phone LIKE p_phone_pattern || '%')
    AND (p_established_min IS NULL OR cm.established_year >= p_established_min)
    AND (p_established_max IS NULL OR cm.established_year <= p_established_max)
  ORDER BY cm.id
  LIMIT p_page_size
  OFFSET p_page * p_page_size;
END;
$$;
