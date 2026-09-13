-- The initial plan fetched 8,006 scattered heap rows before paging because
-- company_id was missing from the list index. Cover the paged projection.
CREATE INDEX company_profile_links_list_match_cover
  ON public.company_profile_links(org_id,list_id,address_match,sort_no,item_id)
  INCLUDE(company_id) WHERE item_id IS NOT NULL;
DROP INDEX public.company_profile_links_list_match;
CREATE STATISTICS company_profile_links_match_stats(mcv,dependencies)
  ON org_id,list_id,address_match FROM public.company_profile_links;
ANALYZE public.company_profile_links;
