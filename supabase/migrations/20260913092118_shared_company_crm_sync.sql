ALTER TABLE public.company_profile_facts ADD COLUMN is_current boolean NOT NULL DEFAULT true;
ALTER TABLE public.company_profiles ADD COLUMN merged_into uuid REFERENCES public.company_profiles(id);
CREATE INDEX company_profiles_merged_into ON public.company_profiles(merged_into) WHERE merged_into IS NOT NULL;

-- Refresh only one company's sources/facts and its indexed list match cache.
-- Manually confirmed shared values take precedence over imported observations.
CREATE FUNCTION public.crm_refresh_company(p_company uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
    home_state=crm_refresh_company.home_state,home_source=crm_refresh_company.home_source,
    source_count=v.source_count,master_count=v.master_count,list_count=v.list_count,
    needs_review=(crm_refresh_company.home_state='conflict' OR coalesce(cardinality(nums),0)>1 OR EXISTS(
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
        WHEN l2.local_home_state='conflict' OR (crm_refresh_company.home_state='conflict' AND l2.representative_key=rep_key) THEN ''
        WHEN l2.local_home_key<>'' AND home_norm<>'' AND l2.representative_key=rep_key AND l2.local_home_key<>home_norm THEN ''
        WHEN l2.local_home_key<>'' THEN l2.local_home_key
        WHEN l2.representative_key<>'' AND (l2.representative_key=rep_key OR p.overrides ? 'representative') THEN home_norm ELSE '' END home_address
    ) a WHERE l2.org_id=p.org_id AND l2.company_id=p.id AND l2.item_id IS NOT NULL
  ) x WHERE l.id=x.id AND l.address_match IS DISTINCT FROM x.match;
END; $$;

CREATE FUNCTION public.crm_sync_source(p_org uuid,p_master_id bigint DEFAULT NULL,p_item_id uuid DEFAULT NULL,p_extra jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  raw jsonb; memo jsonb; d jsonb; old_link public.company_profile_links; target uuid; candidates uuid[];
  nk text; rk text; pk text; ak text; lf text; numbers text[]; cn text; homes text[];
  li uuid; seq integer; source_key text; entry record; normalized text; conflict boolean:=false;
  old_facts jsonb; new_facts jsonb:='[]';
BEGIN
  IF p_master_id IS NOT NULL AND p_item_id IS NULL THEN
    SELECT to_jsonb(m) INTO raw FROM public.company_master m WHERE id=p_master_id;
    IF raw IS NULL THEN RETURN NULL; END IF;
    d:=jsonb_build_object('company_name',raw->>'company_name','representative',coalesce(raw->>'representative',''),
      'phone',coalesce(raw->>'phone',''),'address',coalesce(nullif(raw->>'full_address',''),coalesce(raw->>'prefecture','')||coalesce(raw->>'address','')),
      'business',coalesce(raw->>'business_description',''),'industry',coalesce(nullif(raw->>'industry_sub',''),raw->>'industry_major',''),
      'source_file',coalesce(raw->>'source_file','企業DB'));
    BEGIN memo:=(raw->>'remarks')::jsonb; EXCEPTION WHEN invalid_text_representation THEN memo:='{}'; END;
    source_key:='master:'||p_master_id;
  ELSIF p_item_id IS NOT NULL AND p_master_id IS NULL THEN
    SELECT to_jsonb(i) INTO raw FROM public.call_list_items i JOIN public.call_lists l ON l.id=i.list_id AND l.org_id=i.org_id
      WHERE i.id=p_item_id AND i.org_id=p_org;
    IF raw IS NULL THEN RETURN NULL; END IF;
    li:=(raw->>'list_id')::uuid; seq:=(raw->>'no')::integer;
    d:=jsonb_build_object('company_name',coalesce(raw->>'company',''),'representative',coalesce(raw->>'representative',''),
      'phone',coalesce(raw->>'phone',''),'address',coalesce(raw->>'address',''),'business',coalesce(raw->>'business',''),'industry','',
      'source_file',(SELECT name FROM public.call_lists WHERE id=li AND org_id=p_org));
    BEGIN memo:=(raw->>'memo')::jsonb; EXCEPTION WHEN invalid_text_representation THEN memo:='{}'; END;
    source_key:='calls:'||p_item_id;
  ELSE RAISE invalid_parameter_value USING MESSAGE='One source is required'; END IF;
  IF jsonb_typeof(memo) IS DISTINCT FROM 'object' THEN memo:='{}'; END IF;
  memo:=memo||coalesce(p_extra,'{}');
  nk:=public.crm_identity_name(d->>'company_name'); rk:=public.crm_identity_representative(d->>'representative');
  pk:=public.crm_identity_phone(d->>'phone'); ak:=public.crm_identity_address(d->>'address'); lf:=public.crm_legal_form(d->>'company_name');
  SELECT array_agg(DISTINCT public.crm_corporate_number(value)) FILTER(WHERE public.crm_corporate_number(value) IS NOT NULL) INTO numbers
    FROM jsonb_each_text(memo) WHERE public.crm_identity_text(key) IN ('法人番号','corporate_number','corporatenumber');
  cn:=CASE WHEN cardinality(numbers)=1 THEN numbers[1] ELSE NULL END; conflict:=coalesce(cardinality(numbers)>1,false);
  FOR entry IN SELECT key,value FROM jsonb_each(memo) LOOP
    normalized:=lower(regexp_replace(normalize(entry.key,NFKC),'[\s()（）]','','g'));
    IF normalized=ANY(ARRAY['代表者自宅住所','代表者現住所','代表者現住所詳細','代表者住所詳細','代表者住所','代表者居住地',
      '社長自宅住所','社長住所','自宅住所','representative_address','representative_home_address','president_address']) AND jsonb_typeof(entry.value)='string' THEN
      new_facts:=new_facts||jsonb_build_array(jsonb_build_object('field','representative_address','key',entry.key,
        'value',entry.value#>>'{}','normalized',public.crm_identity_address(entry.value#>>'{}'),'representative_key',rk));
    ELSIF normalized=ANY(ARRAY['法人番号','corporate_number','corporatenumber']) AND public.crm_corporate_number(entry.value#>>'{}') IS NOT NULL THEN
      new_facts:=new_facts||jsonb_build_array(jsonb_build_object('field','corporate_number','key',entry.key,
        'value',entry.value#>>'{}','normalized',public.crm_corporate_number(entry.value#>>'{}'),'representative_key',''));
    END IF;
  END LOOP;
  SELECT array_agg(DISTINCT value->>'normalized') FILTER(WHERE value->>'normalized'<>'') INTO homes
    FROM jsonb_array_elements(new_facts) WHERE value->>'field'='representative_address';
  -- Serialize matching for concurrent imports in this organization. No full-table
  -- scan or call-history work occurs inside an import transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text,871));
  SELECT * INTO old_link FROM public.company_profile_links
    WHERE org_id=p_org AND ((p_master_id IS NOT NULL AND master_id=p_master_id) OR (p_item_id IS NOT NULL AND item_id=p_item_id));
  IF old_link.id IS NOT NULL AND old_link.name_key=nk AND old_link.representative_key=rk AND old_link.phone_key=pk
    AND old_link.address_key=ak AND (cn IS NULL OR old_link.corporate_number=cn) THEN
    target:=old_link.company_id;
  ELSE
    SELECT array_agg(DISTINCT company_id) INTO candidates FROM (
      SELECT company_id FROM public.company_profile_links WHERE org_id=p_org AND cn IS NOT NULL AND corporate_number=cn
      UNION SELECT id FROM public.company_profiles WHERE org_id=p_org AND cn IS NOT NULL AND corporate_number=cn AND merged_into IS NULL
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=p_org AND nk<>'' AND name_key=nk AND pk<>'' AND phone_key=pk
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=p_org AND nk<>'' AND name_key=nk AND rk<>'' AND representative_key=rk
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=p_org AND nk<>'' AND name_key=nk AND ak<>'' AND address_key<>'' AND md5(address_key)=md5(ak) AND address_key=ak
    ) matches;
    IF cardinality(candidates)=1 AND NOT conflict AND NOT EXISTS(
      SELECT 1 FROM public.company_profiles p WHERE p.id=candidates[1] AND p.org_id=p_org
        AND ((cn IS NOT NULL AND p.corporate_number IS NOT NULL AND cn<>p.corporate_number)
          OR (lf<>'' AND public.crm_legal_form(p.company_name)<>'' AND lf<>public.crm_legal_form(p.company_name)
            AND (cn IS NULL OR p.corporate_number IS DISTINCT FROM cn)))
    ) THEN target:=candidates[1]; END IF;
    IF target IS NULL THEN
      INSERT INTO public.company_profiles(org_id,company_name) VALUES(p_org,coalesce(d->>'company_name','')) RETURNING id INTO target;
      IF cardinality(candidates)>0 OR conflict THEN
        INSERT INTO public.company_profile_reviews(org_id,reason,company_ids,source_count)
          VALUES(p_org,CASE WHEN conflict THEN '法人番号の矛盾' ELSE '新規・更新データの名寄せ要確認' END,
            to_jsonb(array_append(coalesce(candidates,'{}'::uuid[]),target)),coalesce(cardinality(candidates),0)+1);
        UPDATE public.company_profiles SET needs_review=true WHERE org_id=p_org AND id=ANY(coalesce(candidates,'{}'::uuid[]));
      END IF;
    END IF;
  END IF;
  IF old_link.id IS NOT NULL THEN
    UPDATE public.company_profile_links SET company_id=target,list_id=li,sort_no=seq,name_key=nk,representative_key=rk,
      phone_key=pk,address_key=ak,corporate_number=coalesce(cn,old_link.corporate_number),legal_form=lf,source_data=d,
      local_home_key=CASE WHEN cardinality(homes)=1 THEN homes[1] ELSE '' END,
      local_home_state=CASE WHEN cardinality(homes)>1 THEN 'conflict' WHEN cardinality(homes)=1 THEN 'available' ELSE 'unknown' END,
      updated_at=now() WHERE id=old_link.id;
  ELSE
    INSERT INTO public.company_profile_links(org_id,company_id,master_id,item_id,list_id,sort_no,name_key,representative_key,phone_key,address_key,
      corporate_number,legal_form,source_data,local_home_key,local_home_state,link_reason)
    VALUES(p_org,target,p_master_id,p_item_id,li,seq,nk,rk,pk,ak,cn,lf,d,CASE WHEN cardinality(homes)=1 THEN homes[1] ELSE '' END,
      CASE WHEN cardinality(homes)>1 THEN 'conflict' WHEN cardinality(homes)=1 THEN 'available' ELSE 'unknown' END,
      CASE WHEN cardinality(candidates)=1 THEN '法人番号・企業名と補助情報の照合' ELSE '新規レコード' END);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('field',field,'value',value,'key',source->>'field',
    'normalized',normalized_value,'representative_key',representative_key) ORDER BY source->>'field'),'[]') INTO old_facts
    FROM public.company_profile_facts WHERE org_id=p_org AND source->>'record_key'=source_key AND is_current;
  UPDATE public.company_profile_facts SET is_current=false
    WHERE org_id=p_org AND source->>'record_key'=source_key AND is_current
      AND (p_item_id IS NOT NULL OR source->>'field' IN (SELECT value->>'key' FROM jsonb_array_elements(new_facts)));
  FOR entry IN SELECT value FROM jsonb_array_elements(new_facts) LOOP
    INSERT INTO public.company_profile_facts(org_id,company_id,source_key,field,value,normalized_value,representative_key,source)
      VALUES(p_org,target,source_key||':'||(entry.value->>'key'),entry.value->>'field',entry.value->>'value',entry.value->>'normalized',entry.value->>'representative_key',
        jsonb_build_object('kind',CASE WHEN p_item_id IS NULL THEN 'master_import' ELSE 'call_list' END,'label',d->>'source_file',
          'record_id',coalesce(p_item_id::text,p_master_id::text),'record_key',source_key,'field',entry.value->>'key'))
      ON CONFLICT(org_id,source_key) DO UPDATE SET company_id=excluded.company_id,value=excluded.value,normalized_value=excluded.normalized_value,
        representative_key=excluded.representative_key,source=excluded.source,is_current=true;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'key'),'[]') INTO new_facts FROM jsonb_array_elements(new_facts);
  IF old_link.id IS NOT NULL AND (old_link.source_data IS DISTINCT FROM d OR old_link.company_id<>target
    OR (p_item_id IS NOT NULL AND old_facts IS DISTINCT FROM new_facts)) THEN
    INSERT INTO public.company_profile_events(org_id,company_id,actor_id,event_type,changes)
      VALUES(p_org,target,auth.uid(),'source_updated',jsonb_build_object('source',source_key,'before',old_link.source_data,'after',d,'previous_company_id',old_link.company_id,'previous_facts',old_facts));
  END IF;
  PERFORM public.crm_refresh_company(target);
  IF old_link.company_id IS NOT NULL AND old_link.company_id<>target THEN PERFORM public.crm_refresh_company(old_link.company_id); END IF;
  RETURN target;
END; $$;

CREATE INDEX company_profile_facts_record ON public.company_profile_facts(org_id,(source->>'record_key')) WHERE is_current;
CREATE FUNCTION public.crm_source_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o record;
BEGIN
  IF TG_TABLE_NAME='call_list_items' THEN
    IF EXISTS(SELECT 1 FROM public.company_profile_sync_orgs WHERE org_id=NEW.org_id AND enabled) THEN
      PERFORM public.crm_sync_source(NEW.org_id,NULL,NEW.id);
    END IF;
  ELSE
    FOR o IN SELECT org_id FROM public.company_profile_sync_orgs WHERE enabled LOOP
      PERFORM public.crm_sync_source(o.org_id,NEW.id,NULL);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER crm_call_source_insert AFTER INSERT ON public.call_list_items FOR EACH ROW EXECUTE FUNCTION public.crm_source_trigger();
CREATE TRIGGER crm_call_source_update AFTER UPDATE OF company,representative,phone,address,business,memo,list_id,no ON public.call_list_items
  FOR EACH ROW WHEN ((OLD.company,OLD.representative,OLD.phone,OLD.address,OLD.business,OLD.memo,OLD.list_id,OLD.no)
    IS DISTINCT FROM (NEW.company,NEW.representative,NEW.phone,NEW.address,NEW.business,NEW.memo,NEW.list_id,NEW.no)) EXECUTE FUNCTION public.crm_source_trigger();
CREATE TRIGGER crm_master_source_insert AFTER INSERT ON public.company_master FOR EACH ROW EXECUTE FUNCTION public.crm_source_trigger();
CREATE TRIGGER crm_master_source_update AFTER UPDATE OF company_name,representative,phone,address,full_address,prefecture,business_description,industry_sub,industry_major,remarks ON public.company_master
  FOR EACH ROW EXECUTE FUNCTION public.crm_source_trigger();

REVOKE ALL ON FUNCTION public.crm_refresh_company(uuid),public.crm_sync_source(uuid,bigint,uuid,jsonb),public.crm_source_trigger() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
