CREATE OR REPLACE FUNCTION public.call_list_filtered_data(
  p_list_id uuid,p_address_match text DEFAULT '',p_start_no integer DEFAULT NULL,p_end_no integer DEFAULT NULL,
  p_offset integer DEFAULT 0,p_limit integer DEFAULT 1000,p_include_count boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); result jsonb; m text:=coalesce(p_address_match,'');
BEGIN
  IF m NOT IN ('','same','different','unknown') THEN RAISE invalid_parameter_value USING MESSAGE='Invalid address match filter'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.call_lists WHERE id=p_list_id AND org_id=o) THEN
    RETURN jsonb_build_object('items','[]'::jsonb,'records','[]'::jsonb,'count',0); END IF;
  EXECUTE $q$
    WITH matched AS NOT MATERIALIZED (
      SELECT s.item_id id,s.sort_no no,s.company_id,s.address_match
        FROM public.company_profile_links s WHERE s.org_id=$1 AND s.list_id=$2 AND s.item_id IS NOT NULL
          AND ($3='' OR s.address_match=$3) AND ($4 IS NULL OR s.sort_no >= $4) AND ($5 IS NULL OR s.sort_no <= $5)
      UNION ALL
      SELECT i.id,i.no,NULL::uuid,public.company_address_match(i) FROM public.call_list_items i
        WHERE i.org_id=$1 AND i.list_id=$2 AND ($3='' OR public.company_address_match(i)=$3)
          AND ($4 IS NULL OR i.no >= $4) AND ($5 IS NULL OR i.no <= $5)
          AND NOT EXISTS(SELECT 1 FROM public.company_profile_links s WHERE s.item_id=i.id AND s.org_id=$1)
    ), selected AS MATERIALIZED (SELECT * FROM matched ORDER BY no,id LIMIT $6 OFFSET $7)
    SELECT jsonb_build_object('count',CASE WHEN $8 THEN (SELECT count(*) FROM matched) ELSE NULL END,
      'items',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('company_id',s.company_id,'shared_address_match',s.address_match,
        'shared_representative_address',CASE WHEN s.company_id IS NOT NULL AND p.home_representative_key=public.crm_identity_representative(i.representative) THEN p.representative_address ELSE NULL END)
        ORDER BY i.no,i.id) FROM selected s JOIN public.call_list_items i ON i.id=s.id AND i.org_id=$1 AND i.list_id=$2
        LEFT JOIN public.company_profiles p ON p.id=s.company_id AND p.org_id=$1),'[]'),
      'records',coalesce((SELECT jsonb_agg(r ORDER BY r.round,r.id) FROM public.call_records r JOIN selected s ON s.id=r.item_id
        WHERE r.org_id=$1 AND r.list_id=$2),'[]'))
  $q$ INTO result USING o,p_list_id,m,p_start_no,p_end_no,greatest(1,least(coalesce(p_limit,1000),1000)),greatest(coalesce(p_offset,0),0),coalesce(p_include_count,true);
  RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.call_list_filter_summary(p_list_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.call_lists WHERE id=p_list_id AND org_id=o) THEN
    RETURN jsonb_build_object('count',0,'prefectures','[]'::jsonb,'address_match',jsonb_build_object('same',0,'different',0,'unknown',0)); END IF;
  EXECUTE $q$
    WITH totals AS MATERIALIZED (
      SELECT count(*) total,coalesce(jsonb_agg(DISTINCT substring(address FROM '^(北海道|東京都|京都府|大阪府|.{2,3}県)'))
        FILTER(WHERE address ~ '^(北海道|東京都|京都府|大阪府|.{2,3}県)'),'[]') prefectures
      FROM public.call_list_items WHERE org_id=$1 AND list_id=$2
    ), matches AS (
      SELECT address_match FROM public.company_profile_links WHERE org_id=$1 AND list_id=$2 AND item_id IS NOT NULL AND address_match<>'unknown'
      UNION ALL
      SELECT public.company_address_match(i) FROM public.call_list_items i WHERE i.org_id=$1 AND i.list_id=$2
        AND public.company_address_match(i) IN ('same','different')
        AND NOT EXISTS(SELECT 1 FROM public.company_profile_links s WHERE s.org_id=$1 AND s.item_id=i.id)
    ), counts AS (SELECT count(*) FILTER(WHERE address_match='same') same,count(*) FILTER(WHERE address_match='different') different FROM matches)
    SELECT jsonb_build_object('count',t.total,'prefectures',t.prefectures,'address_match',
      jsonb_build_object('same',c.same,'different',c.different,'unknown',t.total-c.same-c.different)) FROM totals t CROSS JOIN counts c
  $q$ INTO result USING o,p_list_id;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.call_list_filtered_data(uuid,text,integer,integer,integer,integer,boolean),public.call_list_filter_summary(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.call_list_filtered_data(uuid,text,integer,integer,integer,integer,boolean),public.call_list_filter_summary(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
