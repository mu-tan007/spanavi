CREATE OR REPLACE FUNCTION public.crm_sync_source(p_org uuid,p_master_id bigint DEFAULT NULL,p_item_id uuid DEFAULT NULL,p_extra jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  raw jsonb; memo jsonb; d jsonb; old_link public.company_profile_links; target uuid; candidates uuid[];
  nk text; rk text; pk text; ak text; lf text; numbers text[]; cn text; homes text[];
  li uuid; seq integer; v_source_key text; entry record; normalized text; conflict boolean:=false;
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
    v_source_key:='master:'||p_master_id;
  ELSIF p_item_id IS NOT NULL AND p_master_id IS NULL THEN
    SELECT to_jsonb(i) INTO raw FROM public.call_list_items i JOIN public.call_lists l ON l.id=i.list_id AND l.org_id=i.org_id
      WHERE i.id=p_item_id AND i.org_id=p_org;
    IF raw IS NULL THEN RETURN NULL; END IF;
    li:=(raw->>'list_id')::uuid; seq:=(raw->>'no')::integer;
    d:=jsonb_build_object('company_name',coalesce(raw->>'company',''),'representative',coalesce(raw->>'representative',''),
      'phone',coalesce(raw->>'phone',''),'address',coalesce(raw->>'address',''),'business',coalesce(raw->>'business',''),'industry','',
      'source_file',(SELECT name FROM public.call_lists WHERE id=li AND org_id=p_org));
    BEGIN memo:=(raw->>'memo')::jsonb; EXCEPTION WHEN invalid_text_representation THEN memo:='{}'; END;
    v_source_key:='calls:'||p_item_id;
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
    FROM public.company_profile_facts WHERE org_id=p_org AND source->>'record_key'=v_source_key AND is_current;
  UPDATE public.company_profile_facts SET is_current=false
    WHERE org_id=p_org AND source->>'record_key'=v_source_key AND is_current
      AND (p_item_id IS NOT NULL OR source->>'field' IN (SELECT value->>'key' FROM jsonb_array_elements(new_facts)));
  FOR entry IN SELECT value FROM jsonb_array_elements(new_facts) LOOP
    INSERT INTO public.company_profile_facts(org_id,company_id,source_key,field,value,normalized_value,representative_key,source)
      VALUES(p_org,target,v_source_key||':'||(entry.value->>'key'),entry.value->>'field',entry.value->>'value',entry.value->>'normalized',entry.value->>'representative_key',
        jsonb_build_object('kind',CASE WHEN p_item_id IS NULL THEN 'master_import' ELSE 'call_list' END,'label',d->>'source_file',
          'record_id',coalesce(p_item_id::text,p_master_id::text),'record_key',v_source_key,'field',entry.value->>'key'))
      ON CONFLICT(org_id,source_key) DO UPDATE SET company_id=excluded.company_id,value=excluded.value,normalized_value=excluded.normalized_value,
        representative_key=excluded.representative_key,source=excluded.source,is_current=true;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'key'),'[]') INTO new_facts FROM jsonb_array_elements(new_facts);
  IF old_link.id IS NOT NULL AND (old_link.source_data IS DISTINCT FROM d OR old_link.company_id<>target
    OR (p_item_id IS NOT NULL AND old_facts IS DISTINCT FROM new_facts)) THEN
    INSERT INTO public.company_profile_events(org_id,company_id,actor_id,event_type,changes)
      VALUES(p_org,target,auth.uid(),'source_updated',jsonb_build_object('source',v_source_key,'before',old_link.source_data,'after',d,'previous_company_id',old_link.company_id,'previous_facts',old_facts));
  END IF;
  PERFORM public.crm_refresh_company(target);
  IF old_link.company_id IS NOT NULL AND old_link.company_id<>target THEN PERFORM public.crm_refresh_company(old_link.company_id); END IF;
  RETURN target;
END; $$;

ALTER TABLE public.company_profiles ADD COLUMN search_text text GENERATED ALWAYS AS (
  lower(company_name||' '||representative||' '||phone||' '||coalesce(corporate_number,'')||' '||address||' '||industry)
) STORED;
CREATE INDEX company_profiles_search ON public.company_profiles USING gin(search_text public.gin_trgm_ops);
CREATE INDEX company_profile_reviews_companies ON public.company_profile_reviews USING gin(company_ids);

CREATE FUNCTION public.company_profile_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); result jsonb;
BEGIN
  SELECT jsonb_build_object('total',count(*),'master',count(*) FILTER(WHERE master_count>0),
    'list_only',count(*) FILTER(WHERE master_count=0),'shared',count(*) FILTER(WHERE master_count>0 AND list_count>0),
    'home_available',count(*) FILTER(WHERE home_state='available'),'review',count(*) FILTER(WHERE needs_review),
    'corporate_number',count(*) FILTER(WHERE corporate_number IS NOT NULL),
    'registry_closed',count(*) FILTER(WHERE registry_status='closed'),
    'due',count(*) FILTER(WHERE next_action_at<=now())) INTO result
    FROM public.company_profiles WHERE org_id=o AND source_count>0 AND merged_into IS NULL;
  RETURN result;
END; $$;

CREATE FUNCTION public.search_company_profiles(p_query text DEFAULT '',p_stage text DEFAULT '',p_home text DEFAULT '',
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
        AND ($2='' OR search_text LIKE '%'||$2||'%') AND ($3='' OR crm_stage=$3)
        AND ($4='' OR home_state=$4) AND ($5='' OR registry_status=$5)
        AND ($6='' OR ($6='list_only' AND master_count=0) OR ($6='shared' AND master_count>0 AND list_count>0)
          OR ($6='review' AND needs_review) OR ($6='due' AND next_action_at<=now()))
        AND ($7='' OR industry ILIKE '%'||$7||'%')
    ), page AS (SELECT * FROM matched ORDER BY company_name,id LIMIT $8 OFFSET $9)
    SELECT jsonb_build_object('count',(SELECT count(*) FROM matched),'rows',coalesce((SELECT jsonb_agg(page ORDER BY company_name,id) FROM page),'[]'))
  $q$ INTO result USING o,q,coalesce(p_stage,''),coalesce(p_home,''),coalesce(p_registry,''),coalesce(p_scope,''),coalesce(p_industry,''),
    greatest(1,least(coalesce(p_limit,50),100)),greatest(coalesce(p_offset,0),0);
  RETURN result;
END; $$;

CREATE FUNCTION public.get_company_profile(p_company_id uuid DEFAULT NULL,p_master_id bigint DEFAULT NULL,p_item_id uuid DEFAULT NULL,p_history_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); cid uuid:=p_company_id; p public.company_profiles; result jsonb;
BEGIN
  IF cid IS NULL THEN
    SELECT company_id INTO cid FROM public.company_profile_links WHERE org_id=o
      AND ((p_master_id IS NOT NULL AND master_id=p_master_id) OR (p_item_id IS NOT NULL AND item_id=p_item_id)) LIMIT 1;
  END IF;
  SELECT * INTO p FROM public.company_profiles WHERE id=cid AND org_id=o;
  IF p.merged_into IS NOT NULL THEN SELECT * INTO p FROM public.company_profiles WHERE id=p.merged_into AND org_id=o; END IF;
  IF p.id IS NULL THEN RAISE no_data_found USING MESSAGE='企業カルテが見つかりません'; END IF;
  cid:=p.id;
  SELECT jsonb_build_object('profile',to_jsonb(p)-'search_text',
    'sources',coalesce((SELECT jsonb_agg(x) FROM (
      SELECT s.id,s.master_id,s.item_id,s.list_id,s.sort_no,s.link_reason,s.source_data,s.address_match,
        l.name list_name,l.is_archived,i.call_status
      FROM public.company_profile_links s LEFT JOIN public.call_lists l ON l.id=s.list_id AND l.org_id=o
        LEFT JOIN public.call_list_items i ON i.id=s.item_id AND i.org_id=o
      WHERE s.org_id=o AND s.company_id=cid ORDER BY s.master_id NULLS LAST,s.id LIMIT 200) x),'[]'),
    'facts',coalesce((SELECT jsonb_agg(x) FROM (
      SELECT id,field,value,representative_key,source,normalized_value FROM public.company_profile_facts
      WHERE org_id=o AND company_id=cid AND is_current ORDER BY id LIMIT 100) x),'[]'),
    'fact_count',(SELECT count(*) FROM public.company_profile_facts WHERE org_id=o AND company_id=cid AND is_current),
    'history_count',(SELECT count(*) FROM public.call_records r JOIN public.company_profile_links s ON s.item_id=r.item_id AND s.org_id=r.org_id
      WHERE r.org_id=o AND s.company_id=cid AND r.list_id=s.list_id),
    'history',coalesce((SELECT jsonb_agg(x) FROM (
      SELECT r.id,r.item_id,r.list_id,r.round,r.status,r.called_at,r.memo,r.getter_name,l.name list_name,l.is_archived
      FROM public.call_records r JOIN public.company_profile_links s ON s.item_id=r.item_id AND s.org_id=r.org_id
        JOIN public.call_lists l ON l.id=r.list_id AND l.org_id=r.org_id
      WHERE r.org_id=o AND s.company_id=cid AND r.list_id=s.list_id
      ORDER BY r.called_at DESC NULLS LAST,r.id DESC LIMIT 100 OFFSET greatest(coalesce(p_history_offset,0),0)) x),'[]'),
    'appointments',coalesce((SELECT jsonb_agg(x) FROM (
      SELECT a.id,a.company_name,a.status,a.meeting_date,a.appointment_date,a.getter_name,a.notes,l.name list_name
      FROM public.appointments a JOIN public.company_profile_links s ON s.item_id=a.item_id AND s.org_id=a.org_id
        LEFT JOIN public.call_lists l ON l.id=a.list_id AND l.org_id=a.org_id
      WHERE a.org_id=o AND s.company_id=cid ORDER BY a.created_at DESC LIMIT 50) x),'[]'),
    'deals',coalesce((SELECT jsonb_agg(x) FROM (
      SELECT DISTINCT d.id,d.prospect_company,d.stage,d.closed_status,d.deal_value,d.expected_close_date,d.notes,d.created_at
      FROM public.deals d LEFT JOIN public.appointments a ON a.id=d.appointment_id AND a.org_id=d.org_id
        JOIN public.company_profile_links s ON s.item_id=coalesce(d.call_list_item_id,a.item_id) AND s.org_id=d.org_id
      WHERE d.org_id=o AND s.company_id=cid ORDER BY d.created_at DESC LIMIT 50) x),'[]'),
    'events',coalesce((SELECT jsonb_agg(x) FROM (
      SELECT id,event_type,changes,created_at FROM public.company_profile_events
      WHERE org_id=o AND company_id=cid ORDER BY created_at DESC,id DESC LIMIT 50) x),'[]'),
    'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'reason',r.reason,'status',r.status,'note',r.note,'companies',
      (SELECT jsonb_agg(jsonb_build_object('id',c.id,'company_name',c.company_name,'representative',c.representative,'phone',c.phone,
        'address',c.address,'corporate_number',c.corporate_number)) FROM public.company_profiles c
        WHERE c.org_id=o AND r.company_ids @> to_jsonb(ARRAY[c.id::text]))))
      FROM public.company_profile_reviews r WHERE r.org_id=o AND r.status='pending' AND r.company_ids @> to_jsonb(ARRAY[cid::text])),'[]')
  ) INTO result;
  RETURN result;
END; $$;

CREATE FUNCTION public.update_company_profile(p_company_id uuid,p_version integer,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); p public.company_profiles; e record; shared jsonb; next_at timestamptz;
BEGIN
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN RAISE invalid_parameter_value USING MESSAGE='Invalid company update'; END IF;
  SELECT * INTO p FROM public.company_profiles WHERE id=p_company_id AND org_id=o AND merged_into IS NULL FOR UPDATE;
  IF p.id IS NULL THEN RAISE no_data_found USING MESSAGE='企業カルテが見つかりません'; END IF;
  IF p_version IS DISTINCT FROM p.version THEN RAISE serialization_failure USING MESSAGE='企業情報が更新されました。再読込してから保存してください'; END IF;
  shared:=p.overrides;
  FOR e IN SELECT key,value FROM jsonb_each(p_changes) LOOP
    IF e.key<>ALL(ARRAY['company_name','representative','phone','address','business','industry','corporate_number','representative_address',
      'crm_stage','owner_name','next_action_at','next_action_note','shared_memo','registry_status','registry_source'])
      OR (jsonb_typeof(e.value)<>'string' AND NOT (e.key='next_action_at' AND e.value='null'::jsonb)) THEN
      RAISE invalid_parameter_value USING MESSAGE='Invalid company field'; END IF;
    IF length(e.value#>>'{}')>10000 THEN RAISE invalid_parameter_value USING MESSAGE='入力が長すぎます'; END IF;
    IF e.key=ANY(ARRAY['company_name','representative','phone','address','business','industry','corporate_number','representative_address']) THEN
      shared:=shared||jsonb_build_object(e.key,e.value);
    END IF;
  END LOOP;
  IF p_changes ? 'company_name' AND trim(p_changes->>'company_name')='' THEN RAISE invalid_parameter_value USING MESSAGE='企業名を入力してください'; END IF;
  IF p_changes ? 'corporate_number' AND p_changes->>'corporate_number'<>'' THEN
    IF public.crm_corporate_number(p_changes->>'corporate_number') IS NULL THEN
      RAISE invalid_parameter_value USING MESSAGE='法人番号は検査数字が一致する13桁で入力してください'; END IF;
    shared:=shared||jsonb_build_object('corporate_number',public.crm_corporate_number(p_changes->>'corporate_number'));
  END IF;
  IF p_changes ? 'representative' AND public.crm_identity_representative(p_changes->>'representative')<>public.crm_identity_representative(p.representative)
    AND NOT p_changes ? 'representative_address' THEN shared:=shared-'representative_address'-'home_source'; END IF;
  IF p_changes ? 'representative_address' THEN
    shared:=shared||jsonb_build_object('home_source',jsonb_build_object('kind','manual','label','企業カルテで確認','confirmed_at',now(),'actor_id',auth.uid()));
  END IF;
  next_at:=CASE WHEN p_changes ? 'next_action_at' THEN nullif(p_changes->>'next_action_at','')::timestamptz ELSE p.next_action_at END;
  UPDATE public.company_profiles SET overrides=shared,
    crm_stage=coalesce(p_changes->>'crm_stage',p.crm_stage),owner_name=coalesce(p_changes->>'owner_name',p.owner_name),
    next_action_at=next_at,next_action_note=coalesce(p_changes->>'next_action_note',p.next_action_note),
    shared_memo=coalesce(p_changes->>'shared_memo',p.shared_memo),registry_status=coalesce(p_changes->>'registry_status',p.registry_status),
    registry_source=coalesce(p_changes->>'registry_source',p.registry_source),
    registry_checked_at=CASE WHEN p_changes ? 'registry_status' OR p_changes ? 'registry_source' THEN
      CASE WHEN coalesce(p_changes->>'registry_status',p.registry_status)='unknown' THEN NULL ELSE now() END ELSE p.registry_checked_at END
    WHERE id=p.id;
  INSERT INTO public.company_profile_events(org_id,company_id,actor_id,event_type,changes)
    VALUES(o,p.id,auth.uid(),'shared_updated',jsonb_build_object('before',to_jsonb(p)-'search_text','updated',p_changes));
  PERFORM public.crm_refresh_company(p.id);
  RETURN public.get_company_profile(p.id);
END; $$;

CREATE FUNCTION public.resolve_company_profile_review(p_review_id uuid,p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); ids jsonb; i text;
BEGIN
  IF length(trim(coalesce(p_note,'')))<2 THEN RAISE invalid_parameter_value USING MESSAGE='別会社と判断した根拠を入力してください'; END IF;
  UPDATE public.company_profile_reviews SET status='separate',note=p_note,resolved_by=auth.uid(),resolved_at=now()
    WHERE id=p_review_id AND org_id=o AND status='pending' RETURNING company_ids INTO ids;
  IF ids IS NULL THEN RAISE no_data_found USING MESSAGE='確認対象が見つかりません'; END IF;
  FOR i IN SELECT jsonb_array_elements_text(ids) LOOP
    INSERT INTO public.company_profile_events(org_id,company_id,actor_id,event_type,changes)
      VALUES(o,i::uuid,auth.uid(),'identity_reviewed',jsonb_build_object('review_id',p_review_id,'decision','separate','note',p_note));
    PERFORM public.crm_refresh_company(i::uuid);
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.company_profile_stats(),public.search_company_profiles(text,text,text,text,text,text,integer,integer),
  public.get_company_profile(uuid,bigint,uuid,integer),public.update_company_profile(uuid,integer,jsonb),public.resolve_company_profile_review(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.company_profile_stats(),public.search_company_profiles(text,text,text,text,text,text,integer,integer),
  public.get_company_profile(uuid,bigint,uuid,integer),public.update_company_profile(uuid,integer,jsonb),public.resolve_company_profile_review(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_sync_source(uuid,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
