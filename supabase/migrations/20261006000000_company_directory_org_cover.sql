-- 企業DB：並べ替え・絞り込みに使う列を索引に含め、投影表の本体（values の jsonb が大きい）を読まずに済ませる（2026-10-06）。
SET LOCAL lock_timeout='4s';
CREATE INDEX IF NOT EXISTS company_directory_org_cover ON public.company_directory_search USING btree (org_id, company_id)
 INCLUDE (prefecture, revenue_k, net_income_k, ordinary_income_k, capital_k, employee_count, representative_age, established_year, address_match);
DROP INDEX IF EXISTS public.company_directory_org;
