CREATE OR REPLACE FUNCTION public.crm_refresh_company(p_company uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<refresh>>
DECLARE
  p public.company_profiles; v record; nums text[]; homes text[]; h record;
  rep_key text; home text; home_norm text; home_state text; home_source jsonb;
BEGIN
  SELECT * INTO p FROM public.company_profiles WHERE id=p_company FOR UPDATE;
  IF NOT FOUND OR p.merged_into IS NOT NULL THEN RETURN; END IF;
  SELECT count(*)::integer source_count,count(master_id)::integer master_count,count(DISTINCT list_id)::integer list_count,
    (array_agg(source_data->>'company_name' ORDER BY master_id NULLS LAST,id) FILTER(WHERE coalesce(source_data->>'company_name','')<>''))[1] company_name,
    (array_agg(source_data->>'representative' ORDER BY master_id NULLS LAST,id) FILTER(WHERE coalesce(source_data->>'representative','')<>''))[1] representative,
    (array_agg(source_data->>'phone' ORDER BY master_id NULLS LAST,id) FILTER(WHERE coalesce(source_data->>'phone','')<>''))[1] phone,
    (array_agg(source_data->>'address' ORDER BY master_id NULLS LAST,id) FILTER(WHERE coalesce(source_data->>'address','')<>''))[1] address,
    (array_agg(source_data->>'business' ORDER BY master_id NULLS LAST,id) FILTER(WHERE coalesce(source_data->>'business','')<>''))[1] business,
    (array_agg(source_data->>'industry' ORDER BY master_id NULLS LAST,id) FILTER(WHERE coalesce(source_data->>'industry','')<>''))[1] industry
    INTO v FROM public.company_profile_links WHERE org_id=p.org_id AND company_id=p.id;
  rep_key:=public.crm_identity_representative(coalesce(p.overrides->>'representative',v.representative,''));
  SELECT array_agg(DISTINCT n) INTO nums FROM (
    SELECT corporate_number n FROM public.company_profile_links WHERE org_id=p.org_id AND company_id=p.id
    UNION ALL SELECT normalized_value FROM public.company_profile_facts
      WHERE org_id=p.org_id AND company_id=p.id AND field='corporate_number' AND is_current
  ) x WHERE coalesce(n,'')<>'';
  SELECT array_agg(DISTINCT normalized_value) INTO homes FROM public.company_profile_facts
    WHERE org_id=p.org_id AND company_id=p.id AND field='representative_address' AND is_current
      AND normalized_value<>'' AND representative_key<>'' AND representative_key=rep_key;
  IF p.overrides ? 'representative_address' THEN
    home:=p.overrides->>'representative_address'; home_norm:=public.crm_identity_address(home);
    home_state:=CASE WHEN home_norm<>'' THEN 'available' ELSE 'unknown' END;
    home_source:=coalesce(p.overrides->'home_source',jsonb_build_object('kind','manual','label','企業カルテで確認'));
  ELSIF cardinality(homes)=1 THEN
    SELECT * INTO h FROM public.company_profile_facts
      WHERE org_id=p.org_id AND company_id=p.id AND field='representative_address' AND is_current
        AND normalized_value=homes[1] AND representative_key=rep_key ORDER BY id LIMIT 1;
    home:=h.value; home_norm:=homes[1]; home_state:='available'; home_source:=h.source;
  ELSE
    home:=NULL; home_norm:=''; home_state:=CASE WHEN cardinality(homes)>1 THEN 'conflict' ELSE 'unknown' END; home_source:='{}';
  END IF;
  UPDATE public.company_profiles SET
    company_name=coalesce(p.overrides->>'company_name',v.company_name,p.company_name),
    representative=coalesce(p.overrides->>'representative',v.representative,''),
    phone=coalesce(p.overrides->>'phone',v.phone,''), address=coalesce(p.overrides->>'address',v.address,''),
    business=coalesce(p.overrides->>'business',v.business,''), industry=coalesce(p.overrides->>'industry',v.industry,''),
    corporate_number=CASE WHEN p.overrides ? 'corporate_number' THEN nullif(p.overrides->>'corporate_number','')
      WHEN cardinality(nums)=1 THEN nums[1] ELSE NULL END,
    representative_address=home,home_key=home_norm,home_representative_key=rep_key,
    home_state=refresh.home_state,home_source=refresh.home_source,
    source_count=v.source_count,master_count=v.master_count,list_count=v.list_count,
    needs_review=(refresh.home_state='conflict' OR coalesce(cardinality(nums),0)>1 OR EXISTS(
      SELECT 1 FROM public.company_profile_reviews r WHERE r.org_id=p.org_id AND r.status='pending' AND r.company_ids @> to_jsonb(ARRAY[p.id::text]))),
    updated_at=now(),version=version+1
    WHERE id=p.id;
  -- The dialing row retains its imported phone/status. Shared company address
  -- edits affect comparisons, while historical CEO homes stay tied to that CEO.
  UPDATE public.company_profile_links l SET address_match=x.match,updated_at=now()
  FROM (
    SELECT l2.id,CASE WHEN a.company_address='' OR a.home_address='' THEN 'unknown'
      WHEN a.company_address=a.home_address THEN 'same' ELSE 'different' END match
    FROM public.company_profile_links l2
    CROSS JOIN LATERAL (SELECT
      CASE WHEN p.overrides ? 'address' THEN public.crm_identity_address(p.overrides->>'address')
        ELSE coalesce(nullif(l2.address_key,''),public.crm_identity_address(v.address)) END company_address,
      CASE
        WHEN p.overrides ? 'representative_address' AND (p.overrides ? 'representative' OR l2.representative_key=rep_key) THEN home_norm
        WHEN l2.local_home_state='conflict' OR (refresh.home_state='conflict' AND l2.representative_key=rep_key) THEN ''
        WHEN l2.local_home_key<>'' AND home_norm<>'' AND l2.representative_key=rep_key AND l2.local_home_key<>home_norm THEN ''
        WHEN l2.local_home_key<>'' THEN l2.local_home_key
        WHEN l2.representative_key<>'' AND (l2.representative_key=rep_key OR p.overrides ? 'representative') THEN home_norm ELSE '' END home_address
    ) a WHERE l2.org_id=p.org_id AND l2.company_id=p.id AND l2.item_id IS NOT NULL
  ) x WHERE l.id=x.id AND l.address_match IS DISTINCT FROM x.match;
END; $$;
