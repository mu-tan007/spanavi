SET LOCAL lock_timeout='4s';
CREATE INDEX company_directory_call_history_cover ON public.call_records(org_id,item_id,round DESC NULLS LAST,called_at DESC NULLS LAST,id DESC) INCLUDE(status) WHERE item_id IS NOT NULL;
CREATE INDEX company_directory_source_provider ON public.company_profile_links(org_id,(source_data->>'provider'),company_id) WHERE source_data->>'provider' IS NOT NULL;
CREATE INDEX company_directory_source_provider_name ON public.company_profile_links USING gin((source_data->>'provider_name') public.gin_trgm_ops);
CREATE INDEX company_directory_prefecture_revenue ON public.company_directory_search(org_id,prefecture,revenue_k,company_id);
CREATE INDEX company_directory_ordinary_income ON public.company_directory_search(org_id,ordinary_income_k,company_id);
CREATE INDEX company_directory_capital ON public.company_directory_search(org_id,capital_k,company_id);
