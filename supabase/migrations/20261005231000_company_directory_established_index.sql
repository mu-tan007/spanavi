-- 条件なしで設立年の順に並べるときの索引（2026-10-05・見出しの並び替え用）
SET LOCAL lock_timeout='4s';
CREATE INDEX IF NOT EXISTS company_directory_established ON public.company_directory_search USING btree (org_id, established_year, company_id);
