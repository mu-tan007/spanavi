-- Full-width digits can lack usable trigrams. A complete phone uses its own index.
CREATE OR REPLACE FUNCTION public.search_company_profiles(p_query text DEFAULT '',p_stage text DEFAULT '',p_home text DEFAULT '',
  p_registry text DEFAULT '',p_scope text DEFAULT '',p_industry text DEFAULT '',p_offset integer DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); result jsonb; q text;
BEGIN
  IF coalesce(p_home,'') NOT IN ('','available','unknown','conflict') OR coalesce(p_registry,'') NOT IN ('','unknown','active','closed')
    OR coalesce(p_scope,'') NOT IN ('','list_only','shared','review','due') THEN
    RAISE invalid_parameter_value USING MESSAGE='Invalid company filter'; END IF;
  q:=replace(replace(replace(lower(trim(coalesce(p_query,''))),'\','\\'),'%','\%'),'_','\_');
  EXECUTE $q$
    WITH matched AS NOT MATERIALIZED (
      SELECT id,company_name,representative,phone,address,industry,corporate_number,home_state,needs_review,
        master_count,list_count,source_count,crm_stage,owner_name,next_action_at,next_action_note,registry_status,version
      FROM public.company_profiles WHERE org_id=$1 AND source_count>0 AND merged_into IS NULL
        AND (($10<>'' AND phone<>'' AND public.crm_identity_phone(phone)=$10) OR ($10='' AND ($2='' OR search_text LIKE '%'||$2||'%'))) AND ($3='' OR crm_stage=$3)
        AND ($4='' OR home_state=$4) AND ($5='' OR registry_status=$5)
        AND ($6='' OR ($6='list_only' AND master_count=0) OR ($6='shared' AND master_count>0 AND list_count>0)
          OR ($6='review' AND needs_review) OR ($6='due' AND next_action_at<=now()))
        AND ($7='' OR industry ILIKE '%'||$7||'%')
    ), page AS (SELECT * FROM matched ORDER BY company_name,id LIMIT $8 OFFSET $9)
    SELECT jsonb_build_object('count',(SELECT count(*) FROM matched),'rows',coalesce((SELECT jsonb_agg(page ORDER BY company_name,id) FROM page),'[]'))
  $q$ INTO result USING o,q,coalesce(p_stage,''),coalesce(p_home,''),coalesce(p_registry,''),coalesce(p_scope,''),coalesce(p_industry,''),
    greatest(1,least(coalesce(p_limit,50),100)),greatest(coalesce(p_offset,0),0),public.crm_identity_phone(p_query);
  RETURN result;
END; $$;
ANALYZE public.company_profiles;
