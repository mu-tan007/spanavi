SET LOCAL lock_timeout='4s';
CREATE INDEX company_directory_sort_names ON public.company_profiles(org_id,id) INCLUDE(company_name) WHERE source_count>0 AND merged_into IS NULL;
CREATE OR REPLACE FUNCTION public.search_company_directory(p_filters jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50, p_include_count boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 o uuid:=public.crm_require_org(); f jsonb:=coalesce(p_filters,'{}'); w text; part text; terms text[]; arr text[]; k text; v text;
 spec text[]; parts text[]; mode text; lo numeric; hi numeric; col text; sdir text; ord text;
 call_where text:=''; call_cte text:=''; call_having text[]:='{}'; statuses text[];
 use_calls boolean; no_list boolean; base_where text; count_where text; page_cte text; candidates text:=''; n bigint; result jsonb; q text; source_where text:='';
BEGIN
 IF jsonb_typeof(f)<>'object' OR octet_length(f::text)>100000 OR p_offset<0 OR p_limit<1 OR p_limit>1000 THEN
 RAISE invalid_parameter_value USING MESSAGE='Invalid directory request'; END IF;
 w:=format('p.org_id=%L::uuid AND p.source_count>0 AND p.merged_into IS NULL',o); base_where:=w;
 terms:=public.crm_directory_array(f,'keywords');
 IF cardinality(terms)=0 AND nullif(trim(f->>'keyword'),'') IS NOT NULL THEN terms:=regexp_split_to_array(trim(f->>'keyword'),'[[:space:]　]+'); END IF;
 parts:='{}';
 FOREACH v IN ARRAY terms LOOP
  IF public.crm_identity_phone(v)<>'' THEN parts:=array_append(parts,format('d.phone_key=%L',public.crm_identity_phone(v)));
  ELSE parts:=array_append(parts,format('lower(normalize(p.search_text,NFKC)) LIKE %L','%'||public.crm_directory_like(v)||'%')); END IF;
 END LOOP;
 IF cardinality(parts)>0 THEN w:=w||' AND ('||array_to_string(parts,CASE WHEN f->>'logic'='OR' THEN ' OR ' ELSE ' AND ' END)||')'; END IF;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[
  ['representative','p.representative'],['business','p.business'],['industry','p.industry'],['owner','p.owner_name'],
  ['city','p.address']] LOOP
  v:=nullif(trim(f->>spec[1]),'');
  IF v IS NOT NULL THEN w:=w||format(' AND lower(normalize(%s,NFKC)) LIKE %L',spec[2],'%'||public.crm_directory_like(v)||'%'); END IF;
 END LOOP;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[
  ['prefecture','d.prefecture'],['daibunrui','d.values->>''industry_major'''],['saibunrui','d.values->>''industry_sub'''],
  ['shareholderType','d.shareholder_type']] LOOP
  arr:=public.crm_directory_array(f,spec[1]);
  IF cardinality(arr)>0 THEN w:=w||format(' AND %s=ANY(%L::text[])',spec[2],arr); END IF;
 END LOOP;
 arr:=public.crm_directory_array(f,'cities'); parts:='{}';
 FOREACH v IN ARRAY arr LOOP parts:=array_append(parts,format('lower(normalize(p.address,NFKC)) LIKE %L','%'||public.crm_directory_like(v)||'%')); END LOOP;
 IF cardinality(parts)>0 THEN w:=w||' AND ('||array_to_string(parts,' OR ')||')'; END IF;
 arr:=public.crm_directory_array(f,'phonePatterns');
 IF cardinality(arr)=0 AND nullif(f->>'phonePattern','') IS NOT NULL THEN arr:=regexp_split_to_array(f->>'phonePattern','[,、[:space:]　]+'); END IF;
 parts:='{}';
 FOREACH v IN ARRAY arr LOOP
  v:=regexp_replace(normalize(v,NFKC),'[-()[:space:]‐‑‒–—―−ー]','','g');
  IF v !~ '^[0-9]+$' THEN RAISE invalid_parameter_value USING MESSAGE='電話番号の前方一致は数字で指定してください'; END IF;
  parts:=array_append(parts,format('d.phone_key LIKE %L',v||'%'));
 END LOOP;
 IF cardinality(parts)>0 THEN w:=w||' AND ('||array_to_string(parts,' OR ')||')'; END IF;
 v:=nullif(trim(normalize(f->>'identifier',NFKC)),'');
 IF v IS NOT NULL THEN w:=w||format(' AND (d.identifiers @> ARRAY[%L]::text[] OR d.company_id IN (SELECT company_id FROM public.company_profile_links WHERE org_id=%L::uuid AND corporate_number=%L))',v,o,v); END IF;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[
  ['revenue','revenue_k'],['netIncome','net_income_k'],['ordinaryIncome','ordinary_income_k'],['capital','capital_k'],
  ['employee','employee_count'],['age','representative_age'],['established','established_year']] LOOP
  lo:=NULL; hi:=NULL; mode:=coalesce(f->>(spec[1]||'NullMode'),''); parts:='{}'; col:='d.'||spec[2];
  IF mode NOT IN ('','include','exclude','only') THEN RAISE invalid_parameter_value USING MESSAGE='Invalid missing-value filter'; END IF;
  v:=nullif(f->>(spec[1]||'Min'),''); IF v IS NOT NULL THEN lo:=public.crm_directory_number(v); IF lo IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Invalid minimum'; END IF; END IF;
  v:=nullif(f->>(spec[1]||'Max'),''); IF v IS NOT NULL THEN hi:=public.crm_directory_number(v); IF hi IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Invalid maximum'; END IF; END IF;
  IF mode<>'only' AND lo IS NOT NULL AND hi IS NOT NULL AND (lo>hi OR (lo=hi AND spec[1]<>'established')) THEN RAISE invalid_parameter_value USING MESSAGE='上限（未満）は下限より大きい数値を指定してください'; END IF;
  IF mode='only' THEN w:=w||' AND '||col||' IS NULL'; CONTINUE; END IF;
  IF lo IS NOT NULL THEN parts:=array_append(parts,format('%s>=%L::numeric',col,lo)); END IF;
  IF hi IS NOT NULL THEN parts:=array_append(parts,format('%s%s%L::numeric',col,CASE WHEN spec[1]='established' THEN '<=' ELSE '<' END,hi)); END IF;
  IF cardinality(parts)>0 THEN w:=w||' AND ('||array_to_string(parts,' AND ')||CASE WHEN mode='include' THEN ' OR '||col||' IS NULL' ELSE '' END||')';
  ELSIF mode='exclude' THEN w:=w||' AND '||col||' IS NOT NULL'; END IF;
 END LOOP;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[
  ['stage','p.crm_stage'],['home','p.home_state'],['addressMatch','d.address_match']] LOOP
  v:=nullif(f->>spec[1],''); IF v IS NOT NULL THEN w:=w||format(' AND %s=%L',spec[2],v); END IF;
 END LOOP;
 v:=coalesce(f->>'registry','');
 IF v='exclude_closed' THEN w:=w||' AND p.registry_status<>''closed''';
 ELSIF v<>'' THEN w:=w||format(' AND p.registry_status=%L',v); END IF;
 IF f->>'scope'='review' THEN w:=w||' AND p.needs_review';
 ELSIF f->>'scope'='due' THEN w:=w||' AND p.next_action_at<=now()'; END IF;
 IF f->>'repShareholderMatch'='true' THEN w:=w||' AND d.rep_shareholder_match'; END IF;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[['nextActionFrom','>='],['nextActionTo','<']] LOOP
  v:=nullif(f->>spec[1],'');
  IF v IS NOT NULL THEN w:=w||format(' AND p.next_action_at%s %L::date::timestamp AT TIME ZONE ''Asia/Tokyo''%s',
    spec[2],v,CASE WHEN spec[1]='nextActionTo' THEN ' + interval ''1 day''' ELSE '' END); END IF;
 END LOOP;
 arr:=public.crm_directory_array(f,'dbLabel');
 IF cardinality(arr)>0 THEN w:=w||format(' AND d.company_id IN (SELECT company_id FROM public.company_directory_labels WHERE org_id=%L::uuid AND enabled AND label=ANY(%L::text[]) UNION SELECT l.company_id FROM public.company_profile_links l JOIN public.company_db_labels b ON b.company_master_id=l.master_id AND b.org_id=l.org_id WHERE l.org_id=%L::uuid AND b.label=ANY(%L::text[]) AND NOT EXISTS(SELECT 1 FROM public.company_directory_labels t WHERE t.org_id=l.org_id AND t.company_id=l.company_id AND t.label=b.label))',o,arr,o,arr); END IF;
 -- Provider/file restrictions apply to the same source, with original values retained.
 v:=nullif(f->>'provider','');
 IF v='unknown' THEN source_where:=source_where||' AND coalesce(l.source_data->>''provider'','''')='''''; ELSIF v IS NOT NULL THEN source_where:=source_where||format(' AND l.source_data->>''provider''=%L',v); END IF;
 v:=nullif(f->>'sourceQuery','');
 IF v IS NOT NULL THEN source_where:=source_where||format(' AND (l.source_data->>''source_file'' ILIKE %L OR l.source_data->>''provider_name'' ILIKE %L)','%'||public.crm_directory_like(v)||'%','%'||public.crm_directory_like(v)||'%'); END IF;
 IF source_where<>'' THEN w:=w||format(' AND d.company_id IN (SELECT l.company_id FROM public.company_profile_links l WHERE l.org_id=%L::uuid%s)',o,source_where); END IF;

 statuses:=public.crm_directory_array(f,'callStatus'); no_list:='未登録'=ANY(statuses);
 FOREACH spec SLICE 1 IN ARRAY ARRAY[['listIds','cl.id'],['callCategory','e.category_id'],['callEngagement','cl.engagement_id']] LOOP
  arr:=public.crm_directory_array(f,spec[1]);
  IF cardinality(arr)>0 THEN call_where:=call_where||format(' AND %s=ANY(%L::uuid[])',spec[2],arr::uuid[]); END IF;
 END LOOP;
 use_calls:=cardinality(statuses)>0 OR nullif(f->>'lastCallFrom','') IS NOT NULL OR nullif(f->>'lastCallTo','') IS NOT NULL
  OR nullif(f->>'callCountMin','') IS NOT NULL OR nullif(f->>'callCountMax','') IS NOT NULL;
 IF NOT use_calls AND call_where<>'' THEN
  w:=w||format(' AND d.company_id IN (SELECT l.company_id FROM public.company_profile_links l JOIN public.call_lists cl ON cl.id=l.list_id AND cl.org_id=l.org_id LEFT JOIN public.engagements e ON e.id=cl.engagement_id AND e.org_id=cl.org_id WHERE l.org_id=%L::uuid AND l.item_id IS NOT NULL%s)',o,call_where);
 END IF;
 IF use_calls THEN
  IF w<>base_where THEN candidates:=' AND l.company_id IN (SELECT p.id FROM public.company_profiles p JOIN public.company_directory_search d ON d.company_id=p.id AND d.org_id=p.org_id WHERE '||w||')'; END IF;
  -- One aggregate over scoped items. Never join calls on company name.
  call_cte:=format($ct$WITH scoped_calls AS MATERIALIZED (
    SELECT l.company_id,l.item_id,count(r.id) call_count,max(r.called_at) last_call_at,
      coalesce((array_agg(r.status ORDER BY r.round DESC NULLS LAST,r.called_at DESC NULLS LAST,r.id DESC) FILTER(WHERE r.id IS NOT NULL))[1],'未架電') status
    FROM public.company_profile_links l JOIN public.call_lists cl ON cl.id=l.list_id AND cl.org_id=l.org_id
    LEFT JOIN public.engagements e ON e.id=cl.engagement_id AND e.org_id=cl.org_id
    LEFT JOIN public.call_records r ON r.item_id=l.item_id AND r.org_id=l.org_id
    WHERE l.org_id=%L::uuid AND l.item_id IS NOT NULL%s%s GROUP BY l.company_id,l.item_id
   ), call_companies AS MATERIALIZED (SELECT company_id FROM scoped_calls GROUP BY company_id HAVING $ct$,o,call_where,candidates);
  IF cardinality(array_remove(statuses,'未登録'))>0 THEN call_having:=array_append(call_having,format('bool_or(status=ANY(%L::text[]))',array_remove(statuses,'未登録')));
  ELSIF no_list THEN call_having:=array_append(call_having,'false'); END IF;
  FOREACH spec SLICE 1 IN ARRAY ARRAY[['lastCallFrom','>='],['lastCallTo','<']] LOOP
   v:=nullif(f->>spec[1],''); IF v IS NOT NULL THEN
    call_having:=array_append(call_having,format('max(last_call_at)%s (%L::date::timestamp AT TIME ZONE ''Asia/Tokyo''%s)',spec[2],v,
    CASE WHEN spec[1]='lastCallTo' THEN ' + interval ''1 day''' ELSE '' END)); END IF;
  END LOOP;
  FOREACH spec SLICE 1 IN ARRAY ARRAY[['callCountMin','>='],['callCountMax','<']] LOOP
   v:=nullif(f->>spec[1],''); IF v IS NOT NULL THEN
    IF v !~ '^[0-9]+$' THEN RAISE invalid_parameter_value USING MESSAGE='架電回数は0以上の整数で指定してください'; END IF;
    call_having:=array_append(call_having,format('sum(call_count)%s%L::bigint',spec[2],v)); END IF;
  END LOOP;
  call_cte:=call_cte||coalesce(nullif(array_to_string(call_having,' AND '),''),'true')||') ';
  part:='d.company_id IN (SELECT company_id FROM call_companies)';
  IF no_list AND call_where='' AND nullif(f->>'lastCallFrom','') IS NULL AND nullif(f->>'lastCallTo','') IS NULL
   AND coalesce(nullif(f->>'callCountMin','')::bigint,0)=0 AND coalesce(nullif(f->>'callCountMax','')::bigint,1)>0
  THEN part:=part||format(' OR NOT EXISTS(SELECT 1 FROM public.company_profile_links l WHERE l.org_id=%L::uuid AND l.company_id=d.company_id AND l.item_id IS NOT NULL)',o); END IF;
  w:=w||' AND ('||part||')';
 END IF;
 col:=coalesce(f->>'sortCol','company_name');
 IF col NOT IN ('id','company_name','revenue_k','net_income_k','employee_count','representative_age','next_action_at') THEN RAISE invalid_parameter_value USING MESSAGE='Invalid sort column'; END IF;
 sdir:=CASE WHEN f->>'sortDir'='desc' THEN 'DESC' ELSE 'ASC' END;
 ord:=(CASE WHEN col IN ('revenue_k','net_income_k','employee_count','representative_age') THEN 'd.' ELSE 'p.' END)||col||' '||sdir||' NULLS LAST,p.id';
 q:=' FROM public.company_profiles p JOIN public.company_directory_search d ON d.company_id=p.id AND d.org_id=p.org_id WHERE '||w;
 IF p_include_count THEN
  -- The projection contains exactly active companies, maintained in the same transaction.
  -- Count indexed attributes without reading the large source/profile rows.
  count_where:=substring(w FROM length(base_where)+1);
  IF position('p.' in count_where)=0 THEN
   EXECUTE call_cte||format('SELECT count(*) FROM public.company_directory_search d WHERE d.org_id=%L::uuid',o)||count_where INTO n;
  ELSE EXECUTE call_cte||'SELECT count(*)'||q INTO n; END IF;
 END IF;
 page_cte:=CASE WHEN call_cte='' THEN 'WITH ' ELSE call_cte||', ' END;
 IF w<>base_where THEN
  -- Filter and sort only IDs and one sort value, then load the fifty full records.
  -- The fence prevents a LIMIT plan from probing every company in name order.
  page_cte:=page_cte||'candidates AS MATERIALIZED (SELECT p.id,'||split_part(ord,' ',1)||' sort_value'||q||'), page AS MATERIALIZED (SELECT * FROM candidates ORDER BY sort_value '||sdir||' NULLS LAST,id'||format(' LIMIT %s OFFSET %s)',p_limit,p_offset);
 ELSE
  page_cte:=page_cte||'page AS MATERIALIZED (SELECT p.id,'||split_part(ord,' ',1)||' sort_value'||q||' ORDER BY '||ord||format(' LIMIT %s OFFSET %s)',p_limit,p_offset);
 END IF;
 EXECUTE page_cte||' SELECT coalesce(jsonb_agg(row_data ORDER BY sort_value '||sdir||' NULLS LAST,id),''[]''::jsonb) FROM (SELECT page.id,page.sort_value,
  d.values||jsonb_build_object(''id'',p.id,''company_name'',p.company_name,''representative'',p.representative,''phone'',p.phone,
  ''address'',p.address,''business_description'',p.business,''industry'',p.industry,''corporate_number'',p.corporate_number,
  ''prefecture'',d.prefecture,''city'',CASE WHEN position(lower(normalize(d.values->>''city'',NFKC)) in lower(normalize(p.address,NFKC)))>0 THEN d.values->>''city'' END,''crm_stage'',p.crm_stage,''home_state'',p.home_state,''address_match'',d.address_match,
  ''needs_review'',p.needs_review,''list_count'',p.list_count,''owner_name'',p.owner_name,''next_action_at'',p.next_action_at,
  ''registry_status'',p.registry_status,''version'',p.version) row_data FROM page JOIN public.company_profiles p ON p.id=page.id JOIN public.company_directory_search d ON d.company_id=p.id AND d.org_id=p.org_id WHERE p.org_id='||quote_literal(o)||'::uuid) selected'
 INTO result;
 RETURN jsonb_build_object('count',n,'rows',result);
END; $function$
;
NOTIFY pgrst,'reload schema';
