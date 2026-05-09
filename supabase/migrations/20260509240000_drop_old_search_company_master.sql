-- =====================================================================
-- search_company_master の古いオーバーロードを削除
--
-- 背景:
--   PostgreSQL は引数追加で CREATE OR REPLACE すると、別シグネチャの関数として
--   新しく登録される（既存版は残る）。pgvector / industry_or_mode 追加で
--   31引数版・33引数版・34引数版が並存し、PostgREST が
--   「Could not choose the best candidate function」エラーを出す状況に。
--
--   34引数版（最新）だけを残して残り2つを削除する。
-- =====================================================================

set local search_path = public, extensions;

DROP FUNCTION IF EXISTS public.search_company_master(
  p_keyword text, p_daibunrui_arr text[], p_saibunrui_arr text[], p_prefecture_arr text[],
  p_city text, p_revenue_min bigint, p_revenue_max bigint, p_revenue_include_null boolean,
  p_revenue_exclude_null boolean, p_net_income_min bigint, p_net_income_max bigint,
  p_net_income_include_null boolean, p_net_income_exclude_null boolean,
  p_age_min smallint, p_age_max smallint, p_age_include_null boolean, p_age_exclude_null boolean,
  p_employee_min integer, p_employee_max integer, p_employee_include_null boolean,
  p_employee_exclude_null boolean, p_phone_pattern text, p_established_min smallint,
  p_established_max smallint, p_shareholder_type_arr text[], p_rep_shareholder_match boolean,
  p_logic text, p_sort_col text, p_sort_dir text, p_page integer, p_page_size integer
);

DROP FUNCTION IF EXISTS public.search_company_master(
  p_keyword text, p_daibunrui_arr text[], p_saibunrui_arr text[], p_prefecture_arr text[],
  p_city text, p_revenue_min bigint, p_revenue_max bigint, p_revenue_include_null boolean,
  p_revenue_exclude_null boolean, p_net_income_min bigint, p_net_income_max bigint,
  p_net_income_include_null boolean, p_net_income_exclude_null boolean,
  p_age_min smallint, p_age_max smallint, p_age_include_null boolean, p_age_exclude_null boolean,
  p_employee_min integer, p_employee_max integer, p_employee_include_null boolean,
  p_employee_exclude_null boolean, p_phone_pattern text, p_established_min smallint,
  p_established_max smallint, p_shareholder_type_arr text[], p_rep_shareholder_match boolean,
  p_logic text, p_sort_col text, p_sort_dir text, p_page integer, p_page_size integer,
  p_keyword_arr text[], p_query_embedding vector
);
