CREATE OR REPLACE FUNCTION public.match_company_duplicates(p_rows jsonb)
RETURNS TABLE(row_index integer,existing_id bigint,existing_name text,existing_representative text,existing_field_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); r jsonb; nk text; rk text; pk text; ak text; cn text; ids uuid[]; mid bigint;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>1000 THEN
    RAISE invalid_parameter_value USING MESSAGE='Invalid import batch'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    nk:=public.crm_identity_name(r->>'company_name');rk:=public.crm_identity_representative(r->>'representative');
    pk:=public.crm_identity_phone(r->>'phone');ak:=public.crm_identity_address(r->>'address');cn:=public.crm_corporate_number(r->>'corporate_number');
    SELECT array_agg(DISTINCT company_id) INTO ids FROM (
      SELECT company_id FROM public.company_profile_links WHERE org_id=o AND cn IS NOT NULL AND corporate_number=cn
      UNION SELECT id FROM public.company_profiles WHERE org_id=o AND cn IS NOT NULL AND corporate_number=cn AND merged_into IS NULL
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=o AND nk<>'' AND name_key<>'' AND representative_key<>'' AND name_key=nk AND rk<>'' AND representative_key=rk
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=o AND nk<>'' AND name_key<>'' AND phone_key<>'' AND name_key=nk AND pk<>'' AND phone_key=pk
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=o AND nk<>'' AND name_key<>'' AND name_key=nk AND ak<>'' AND address_key<>'' AND md5(address_key)=md5(ak) AND address_key=ak
    ) candidates;
    IF cardinality(ids) IS DISTINCT FROM 1 THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.company_profiles p WHERE p.org_id=o AND p.id=ids[1]
      AND ((cn IS NOT NULL AND p.corporate_number IS NOT NULL AND cn<>p.corporate_number)
        OR (public.crm_legal_form(r->>'company_name')<>'' AND public.crm_legal_form(p.company_name)<>''
          AND public.crm_legal_form(r->>'company_name')<>public.crm_legal_form(p.company_name)
          AND (cn IS NULL OR p.corporate_number IS DISTINCT FROM cn)))) THEN CONTINUE; END IF;
    SELECT min(master_id) INTO mid FROM public.company_profile_links WHERE org_id=o AND company_id=ids[1] AND master_id IS NOT NULL;
    IF mid IS NULL THEN CONTINUE; END IF;
    RETURN QUERY SELECT (r->>'row_index')::integer,m.id,m.company_name,m.representative,
      (SELECT count(*)::integer FROM jsonb_each(to_jsonb(m)-ARRAY['id','created_at','normalized_name','normalized_representative','embedding','embedded_at']) e
        WHERE e.value<>'null'::jsonb AND e.value<>'""'::jsonb)
      FROM public.company_master m WHERE m.id=mid;
  END LOOP;
END; $$;

ALTER FUNCTION public.import_company_master_batch(jsonb,jsonb) RENAME TO import_company_master_batch_legacy;
ALTER FUNCTION public.import_company_master_batch_legacy(jsonb,jsonb) SET search_path=public,pg_temp;
REVOKE ALL ON FUNCTION public.import_company_master_batch_legacy(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.import_company_master_batch(p_inserts jsonb,p_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); r jsonb; mid bigint; ins integer:=0; upd integer:=0; extra jsonb;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN RAISE insufficient_privilege USING MESSAGE='企業DBの取込は管理者のみ実行できます'; END IF;
  IF jsonb_typeof(p_inserts) IS DISTINCT FROM 'array' OR jsonb_typeof(p_updates) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_inserts)+jsonb_array_length(p_updates)>1000 THEN RAISE invalid_parameter_value USING MESSAGE='Invalid import batch'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_inserts) LOOP
    IF trim(coalesce(r->>'company_name',''))='' THEN RAISE invalid_parameter_value USING MESSAGE='企業名を入力してください'; END IF;
    -- Recheck after preview so concurrent imports do not add the same company.
    PERFORM pg_advisory_xact_lock(hashtextextended(o::text,871));
    SELECT existing_id INTO mid FROM public.match_company_duplicates(jsonb_build_array(r||jsonb_build_object('row_index',0)));
    IF mid IS NULL THEN
      PERFORM public.import_company_master_batch_legacy(jsonb_build_array(r),'[]');
      mid:=currval(pg_get_serial_sequence('public.company_master','id')); ins:=ins+1;
    ELSE upd:=upd+1; END IF;
    extra:=jsonb_strip_nulls(jsonb_build_object('representative_address',r->'representative_address','corporate_number',r->'corporate_number'));
    PERFORM public.crm_sync_source(o,mid,NULL,extra);
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
    SELECT existing_id INTO mid FROM public.match_company_duplicates(jsonb_build_array(r||jsonb_build_object('row_index',0)));
    IF mid IS NULL OR mid<>(r->>'id')::bigint THEN RAISE serialization_failure USING MESSAGE='名寄せ結果が変わりました。重複確認をやり直してください'; END IF;
    IF coalesce((r->>'_facts_only')::boolean,false) IS NOT TRUE THEN
      PERFORM public.import_company_master_batch_legacy('[]',jsonb_build_array(r));
    END IF;
    extra:=jsonb_strip_nulls(jsonb_build_object('representative_address',r->'representative_address','corporate_number',r->'corporate_number'));
    PERFORM public.crm_sync_source(o,mid,NULL,extra); upd:=upd+1;
  END LOOP;
  RETURN jsonb_build_object('inserted',ins,'updated',upd);
END; $$;
REVOKE ALL ON FUNCTION public.match_company_duplicates(jsonb),public.import_company_master_batch(jsonb,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.match_company_duplicates(jsonb),public.import_company_master_batch(jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
