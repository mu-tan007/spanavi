-- List deletion validates its FK by list_id, independently of the caller's org.
CREATE INDEX company_profile_links_list ON public.company_profile_links(list_id) WHERE list_id IS NOT NULL;
