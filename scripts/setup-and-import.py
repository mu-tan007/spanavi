"""
1. Create company_master table + indexes + RPC
2. Import 483K rows from CSV via COPY
"""
import psycopg2
import os
import time

DB_URI = "postgresql://postgres:3mxX16fa0qrRoqvw@db.baiiznjzvzhxwwqzsozn.supabase.co:5432/postgres"
CSV_PATH = r"C:\Users\篠宮拓武\OneDrive\ドキュメント\MASP\①リスト\弊社リスト\company_master_import.csv"

DDL = """
-- trigram extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Main table
CREATE TABLE IF NOT EXISTS company_master (
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

-- Category lookup
CREATE TABLE IF NOT EXISTS tsr_category_master (
  id         SERIAL PRIMARY KEY,
  daibunrui  TEXT NOT NULL,
  saibunrui  TEXT NOT NULL
);
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS idx_cm_name_trgm ON company_master USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cm_desc_trgm ON company_master USING gin (business_description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cm_phone_trgm ON company_master USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cm_industry_major ON company_master (industry_major);
CREATE INDEX IF NOT EXISTS idx_cm_industry_sub ON company_master (industry_sub);
CREATE INDEX IF NOT EXISTS idx_cm_revenue ON company_master (revenue_k) WHERE revenue_k IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_age ON company_master (representative_age) WHERE representative_age IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_employee ON company_master (employee_count) WHERE employee_count IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_established ON company_master (established_year) WHERE established_year IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_prefecture ON company_master (prefecture);
CREATE INDEX IF NOT EXISTS idx_cm_pref_city ON company_master (prefecture, city);
CREATE INDEX IF NOT EXISTS idx_cm_tsr_id ON company_master (tsr_id) WHERE tsr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tcm_daibunrui ON tsr_category_master (daibunrui);
"""

RLS = """
ALTER TABLE company_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cm_select_auth ON company_master;
CREATE POLICY cm_select_auth ON company_master FOR SELECT TO authenticated USING (true);

ALTER TABLE tsr_category_master ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tcm_select_auth ON tsr_category_master;
CREATE POLICY tcm_select_auth ON tsr_category_master FOR SELECT TO authenticated USING (true);
"""

RPC = """
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
    cm.id, cm.company_name, cm.business_description, cm.postal_code,
    cm.prefecture, cm.city, cm.address, cm.full_address,
    cm.revenue_k, cm.net_income_k, cm.ordinary_income_k, cm.capital_k,
    cm.established_year, cm.representative, cm.representative_age,
    cm.employee_count, cm.industry_major, cm.industry_sub,
    cm.phone, cm.tsr_id, cm.remarks, cm.source_file,
    cm.shareholders, cm.officers,
    count(*) OVER() AS total_count
  FROM company_master cm
  WHERE
    (p_keyword IS NULL OR cm.company_name ILIKE '%' || p_keyword || '%' OR cm.business_description ILIKE '%' || p_keyword || '%')
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
"""

def main():
    conn = psycopg2.connect(DB_URI)
    conn.autocommit = True
    cur = conn.cursor()

    # Step 1: Create tables
    print("Creating tables...", flush=True)
    cur.execute(DDL)
    print("  Done.")

    # Step 2: Create indexes (before data for tsr_id unique check, after for speed)
    # We'll create indexes after import for speed

    # Step 3: RLS
    print("Setting up RLS...", flush=True)
    cur.execute(RLS)
    print("  Done.")

    # Step 4: RPC
    print("Creating search RPC...", flush=True)
    cur.execute(RPC)
    print("  Done.")

    # Step 5: Check existing data
    cur.execute("SELECT count(*) FROM company_master")
    existing = cur.fetchone()[0]
    print(f"Existing rows: {existing}")

    if existing > 0:
        print("Clearing existing data for fresh import...")
        cur.execute("TRUNCATE company_master RESTART IDENTITY")
        # Also clear test data
        print("  Cleared.")

    # Step 6: Import CSV via COPY
    print(f"Importing CSV: {CSV_PATH}", flush=True)
    conn.autocommit = False

    columns = [
        'company_name', 'business_description', 'postal_code', 'prefecture',
        'city', 'address', 'full_address', 'revenue_k', 'net_income_k',
        'ordinary_income_k', 'capital_k', 'established_year', 'representative',
        'representative_age', 'employee_count', 'industry_major', 'industry_sub',
        'phone', 'tsr_id', 'remarks', 'source_file', 'shareholders', 'officers'
    ]

    start = time.time()
    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        cur.copy_expert(
            f"COPY company_master ({','.join(columns)}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')",
            f
        )
    conn.commit()
    elapsed = time.time() - start

    cur.execute("SELECT count(*) FROM company_master")
    total = cur.fetchone()[0]
    print(f"  Imported {total:,} rows in {elapsed:.1f}s")

    # Step 7: Create indexes (after import is faster)
    print("Creating indexes...", flush=True)
    conn.autocommit = True
    idx_start = time.time()
    for line in INDEXES.strip().split('\n'):
        line = line.strip()
        if line and not line.startswith('--'):
            print(f"  {line[:60]}...", flush=True)
            cur.execute(line)
    idx_elapsed = time.time() - idx_start
    print(f"  Indexes created in {idx_elapsed:.1f}s")

    # Step 8: Populate category master
    print("Populating tsr_category_master...", flush=True)
    cur.execute("TRUNCATE tsr_category_master RESTART IDENTITY")
    cur.execute("""
        INSERT INTO tsr_category_master (daibunrui, saibunrui)
        SELECT DISTINCT industry_major, industry_sub
        FROM company_master
        WHERE industry_major IS NOT NULL AND industry_sub IS NOT NULL
        ORDER BY industry_major, industry_sub
    """)
    cur.execute("SELECT count(*) FROM tsr_category_master")
    cat_count = cur.fetchone()[0]
    print(f"  {cat_count} categories inserted")

    cur.close()
    conn.close()
    print("\nAll done!")

if __name__ == "__main__":
    main()
