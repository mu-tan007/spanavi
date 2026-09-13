SET LOCAL lock_timeout='4s';
CREATE INDEX company_directory_keywords ON public.company_profiles USING gin((lower(normalize(search_text,NFKC))) public.gin_trgm_ops);
CREATE TABLE public.company_directory_labels(
 org_id uuid NOT NULL, company_id uuid NOT NULL, label text NOT NULL CHECK(label IN ('M&Aニーズあり','買収候補先')),
 enabled boolean NOT NULL, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,company_id,label),
 FOREIGN KEY(org_id,company_id) REFERENCES public.company_profiles(org_id,id) ON DELETE CASCADE
);
ALTER TABLE public.company_directory_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_directory_labels FROM anon,authenticated;
CREATE POLICY company_directory_labels_read ON public.company_directory_labels FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
GRANT SELECT ON public.company_directory_labels TO authenticated;
CREATE FUNCTION public.crm_directory_company_labels(o uuid,c uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(label ORDER BY label),'[]') FROM (
  SELECT label FROM public.company_directory_labels WHERE org_id=o AND company_id=c AND enabled
  UNION
  SELECT b.label FROM public.company_profile_links l JOIN public.company_db_labels b ON b.org_id=l.org_id AND b.company_master_id=l.master_id
   WHERE l.org_id=o AND l.company_id=c AND NOT EXISTS(SELECT 1 FROM public.company_directory_labels d WHERE d.org_id=o AND d.company_id=c AND d.label=b.label)
 ) x;
$$;
REVOKE ALL ON FUNCTION public.crm_directory_company_labels(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_company_directory_values(p_company_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); result jsonb;
BEGIN
 SELECT jsonb_build_object('values',d.values,'labels',public.crm_directory_company_labels(o,p.id),'sources',coalesce((SELECT jsonb_object_agg(k.key,jsonb_build_object(
  'file',l.source_data->>'source_file','provider',l.source_data->>'provider_name','row',l.source_data->'row'))
 FROM jsonb_each_text(d.field_sources) k JOIN public.company_profile_links l ON l.id=k.value::bigint AND l.org_id=o),'{}'))
 INTO result FROM public.company_profiles p LEFT JOIN public.company_directory_search d ON d.company_id=p.id AND d.org_id=p.org_id
 WHERE p.org_id=o AND p.id=p_company_id AND p.source_count>0 AND p.merged_into IS NULL;
 RETURN coalesce(result,'{}'); END; $$;
CREATE FUNCTION public.set_company_directory_label(p_company_id uuid,p_label text,p_enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org();
BEGIN
 IF p_label NOT IN ('M&Aニーズあり','買収候補先') OR p_enabled IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Invalid company label'; END IF;
 PERFORM id FROM public.company_profiles WHERE id=p_company_id AND org_id=o AND source_count>0 AND merged_into IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE='Company not available'; END IF;
 INSERT INTO public.company_directory_labels(org_id,company_id,label,enabled,updated_by) VALUES(o,p_company_id,p_label,p_enabled,auth.uid())
 ON CONFLICT(org_id,company_id,label) DO UPDATE SET enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=now();
 INSERT INTO public.company_profile_events(org_id,company_id,actor_id,event_type,changes)
 VALUES(o,p_company_id,auth.uid(),'label_updated',jsonb_build_object('label',p_label,'enabled',p_enabled));
 RETURN public.get_company_directory_values(p_company_id);
END; $$;
REVOKE ALL ON FUNCTION public.set_company_directory_label(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_company_directory_label(uuid,text,boolean) TO authenticated;
CREATE FUNCTION public.crm_directory_merge_labels() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.merged_into IS NOT NULL AND OLD.merged_into IS DISTINCT FROM NEW.merged_into THEN
  INSERT INTO public.company_directory_labels(org_id,company_id,label,enabled,updated_by)
  SELECT org_id,NEW.merged_into,label,enabled,updated_by FROM public.company_directory_labels WHERE org_id=NEW.org_id AND company_id=NEW.id
  ON CONFLICT(org_id,company_id,label) DO NOTHING;
 END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER crm_directory_merge_labels AFTER UPDATE OF merged_into ON public.company_profiles FOR EACH ROW EXECUTE FUNCTION public.crm_directory_merge_labels();
REVOKE ALL ON FUNCTION public.crm_directory_merge_labels() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_directory_prefecture(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(substring(normalize(v,NFKC) from '(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)'),'');
$$;

CREATE OR REPLACE FUNCTION public.crm_refresh_directory(p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Serialize a small batch with ordinary profile refreshes; never backfill one giant transaction.
 PERFORM id FROM public.company_profiles WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE;
 WITH links AS MATERIALIZED (
  SELECT l.* FROM public.company_profile_links l WHERE l.company_id=ANY(p_ids)
 ), sources AS (
  SELECT l.company_id,l.id link_id,2 priority,l.master_id::text source_order,'-infinity'::timestamptz created_at,
   jsonb_strip_nulls(jsonb_build_object(
    'postal_code',nullif(m.postal_code,''),'city',nullif(m.city,''),'industry_major',nullif(m.industry_major,''),
    'industry_sub',nullif(m.industry_sub,''),'tsr_id',nullif(m.tsr_id,''),'revenue_k',m.revenue_k,
    'net_income_k',m.net_income_k,'ordinary_income_k',m.ordinary_income_k,'capital_k',m.capital_k,
    'employee_count',m.employee_count,'representative_age',m.representative_age,'established_year',m.established_year,
    'shareholders',nullif(m.shareholders,''),'officers',nullif(m.officers,''),'clients',nullif(m.clients,''),
    'suppliers',nullif(m.suppliers,''),'remarks',nullif(m.remarks,''))) data
  FROM links l JOIN public.company_master m ON m.id=l.master_id
  UNION ALL
  SELECT l.company_id,l.id,3,l.id::text,i.created_at,
   jsonb_strip_nulls(jsonb_build_object('revenue_k',public.crm_directory_number(i.revenue),
    'net_income_k',i.net_income,'employee_count',public.crm_directory_number(i.employees),'url',nullif(i.url,''),
    'representative_age',public.crm_directory_number(coalesce(public.crm_directory_memo(i.memo)->>'代表者年齢',
       public.crm_directory_memo(i.memo)->>'age'))))
  FROM links l JOIN public.call_list_items i ON i.id=l.item_id AND i.org_id=l.org_id WHERE l.import_row_id IS NULL
  UNION ALL
  SELECT l.company_id,l.id,1,l.id::text,r.created_at,
   (r.normalized - ARRAY['company_name','representative','phone','address','business','corporate_number','representative_address'])
    || CASE WHEN r.normalized ? 'tsr_code' THEN jsonb_build_object('tsr_id',r.normalized->'tsr_code') ELSE '{}'::jsonb END
  FROM links l JOIN public.company_import_rows r ON r.id=l.import_row_id AND r.org_id=l.org_id
 ), picked AS (
  SELECT DISTINCT ON (s.company_id,e.key) s.company_id,e.key,e.value,s.link_id
  FROM sources s CROSS JOIN LATERAL jsonb_each(s.data) e
  WHERE e.value<>'null'::jsonb AND e.value<>'""'::jsonb
   AND (e.key<>'representative_age' OR EXISTS (SELECT 1 FROM public.company_profiles cp JOIN public.company_profile_links cl ON cl.id=s.link_id AND cl.org_id=cp.org_id
    WHERE cp.id=s.company_id AND cl.representative_key<>'' AND cl.representative_key=cp.home_representative_key))
  ORDER BY s.company_id,e.key,s.priority,s.created_at DESC,s.link_id
 ), aggregated AS (
  SELECT company_id,jsonb_object_agg(key,value) vals,jsonb_object_agg(key,link_id) refs FROM picked GROUP BY company_id
 ), codes AS (
  SELECT company_id,array_agg(DISTINCT code) identifiers FROM (
   SELECT s.company_id,e.value #>> '{}' code FROM sources s CROSS JOIN LATERAL jsonb_each(s.data) e
   WHERE e.key IN ('tsr_id','tsr_code','tdb_code','source_company_code')
   UNION ALL SELECT p.id,p.corporate_number FROM public.company_profiles p WHERE p.id=ANY(p_ids)
  ) x WHERE coalesce(code,'')<>'' GROUP BY company_id
 )
 INSERT INTO public.company_directory_search(company_id,org_id,values,field_sources,prefecture,phone_key,address_match,shareholder_type,rep_shareholder_match,identifiers)
 SELECT p.id,p.org_id,coalesce(a.vals,'{}'),coalesce(a.refs,'{}'),
  public.crm_directory_prefecture(p.address),
  public.crm_identity_phone(p.phone),
  CASE WHEN p.home_state<>'available' OR coalesce(p.home_key,'')='' OR public.crm_identity_address(p.address)='' THEN 'unknown'
   WHEN public.crm_identity_address(p.address)=p.home_key THEN 'same' ELSE 'different' END,
  CASE WHEN nullif(trim(a.vals->>'shareholders'),'') IS NULL THEN 'empty' ELSE public.classify_shareholder_type(a.vals->>'shareholders') END,
  public.crm_identity_representative(p.representative)<>'' AND
    position(public.crm_identity_representative(p.representative) in public.crm_identity_representative(a.vals->>'shareholders'))>0,
  coalesce(c.identifiers,'{}')
 FROM public.company_profiles p LEFT JOIN aggregated a ON a.company_id=p.id LEFT JOIN codes c ON c.company_id=p.id
 WHERE p.id=ANY(p_ids) AND p.source_count>0 AND p.merged_into IS NULL
 ON CONFLICT(company_id) DO UPDATE SET values=EXCLUDED.values,field_sources=EXCLUDED.field_sources,
  prefecture=EXCLUDED.prefecture,phone_key=EXCLUDED.phone_key,address_match=EXCLUDED.address_match,
  shareholder_type=EXCLUDED.shareholder_type,rep_shareholder_match=EXCLUDED.rep_shareholder_match,
  identifiers=EXCLUDED.identifiers,updated_at=now();
 DELETE FROM public.company_directory_search d USING public.company_profiles p
 WHERE d.company_id=p.id AND p.id=ANY(p_ids) AND (p.source_count=0 OR p.merged_into IS NOT NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.search_company_directory(p_filters jsonb DEFAULT '{}',p_offset int DEFAULT 0,p_limit int DEFAULT 50,p_include_count boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 o uuid:=public.crm_require_org(); f jsonb:=coalesce(p_filters,'{}'); w text; part text; terms text[]; arr text[]; k text; v text;
 spec text[]; parts text[]; mode text; lo numeric; hi numeric; col text; sdir text; ord text;
 call_where text:=''; call_cte text:=''; call_having text[]:='{}'; statuses text[];
 use_calls boolean; no_list boolean; n bigint; result jsonb; q text; source_where text:='';
BEGIN
 IF jsonb_typeof(f)<>'object' OR octet_length(f::text)>100000 OR p_offset<0 OR p_limit<1 OR p_limit>1000 THEN
 RAISE invalid_parameter_value USING MESSAGE='Invalid directory request'; END IF;
 w:=format('p.org_id=%L::uuid AND p.source_count>0 AND p.merged_into IS NULL',o);
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
 IF v IS NOT NULL THEN w:=w||format(' AND (d.identifiers @> ARRAY[%L]::text[] OR p.id IN (SELECT company_id FROM public.company_profile_links WHERE org_id=%L::uuid AND corporate_number=%L))',v,o,v); END IF;
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
 IF cardinality(arr)>0 THEN w:=w||format(' AND p.id IN (SELECT company_id FROM public.company_directory_labels WHERE org_id=%L::uuid AND enabled AND label=ANY(%L::text[]) UNION SELECT l.company_id FROM public.company_profile_links l JOIN public.company_db_labels b ON b.company_master_id=l.master_id AND b.org_id=l.org_id WHERE l.org_id=%L::uuid AND b.label=ANY(%L::text[]) AND NOT EXISTS(SELECT 1 FROM public.company_directory_labels t WHERE t.org_id=l.org_id AND t.company_id=l.company_id AND t.label=b.label))',o,arr,o,arr); END IF;
 -- Provider/file restrictions apply to the same source, with original values retained.
 v:=nullif(f->>'provider','');
 IF v='unknown' THEN source_where:=source_where||' AND coalesce(l.source_data->>''provider'','''')='''''; ELSIF v IS NOT NULL THEN source_where:=source_where||format(' AND l.source_data->>''provider''=%L',v); END IF;
 v:=nullif(f->>'sourceQuery','');
 IF v IS NOT NULL THEN source_where:=source_where||format(' AND (l.source_data->>''source_file'' ILIKE %L OR l.source_data->>''provider_name'' ILIKE %L)','%'||public.crm_directory_like(v)||'%','%'||public.crm_directory_like(v)||'%'); END IF;
 IF source_where<>'' THEN w:=w||format(' AND p.id IN (SELECT l.company_id FROM public.company_profile_links l WHERE l.org_id=%L::uuid%s)',o,source_where); END IF;

 statuses:=public.crm_directory_array(f,'callStatus'); no_list:='未登録'=ANY(statuses);
 FOREACH spec SLICE 1 IN ARRAY ARRAY[['listIds','cl.id'],['callCategory','e.category_id'],['callEngagement','cl.engagement_id']] LOOP
  arr:=public.crm_directory_array(f,spec[1]);
  IF cardinality(arr)>0 THEN call_where:=call_where||format(' AND %s=ANY(%L::uuid[])',spec[2],arr::uuid[]); END IF;
 END LOOP;
 use_calls:=call_where<>'' OR cardinality(statuses)>0 OR nullif(f->>'lastCallFrom','') IS NOT NULL OR nullif(f->>'lastCallTo','') IS NOT NULL
  OR nullif(f->>'callCountMin','') IS NOT NULL OR nullif(f->>'callCountMax','') IS NOT NULL;
 IF use_calls THEN
  -- One aggregate over scoped items. Never join calls on company name.
  call_cte:=format($ct$WITH scoped_calls AS MATERIALIZED (
    SELECT l.company_id,i.id item_id,count(r.id) call_count,max(r.called_at) last_call_at,
      coalesce((array_agg(r.status ORDER BY r.round DESC NULLS LAST,r.called_at DESC NULLS LAST,r.id DESC) FILTER(WHERE r.id IS NOT NULL))[1],'未架電') status
    FROM public.company_profile_links l JOIN public.call_list_items i ON i.id=l.item_id AND i.org_id=l.org_id
    JOIN public.call_lists cl ON cl.id=i.list_id AND cl.org_id=i.org_id
    LEFT JOIN public.engagements e ON e.id=cl.engagement_id AND e.org_id=cl.org_id
    LEFT JOIN public.call_records r ON r.item_id=i.id AND r.org_id=i.org_id
    WHERE l.org_id=%L::uuid%s GROUP BY l.company_id,i.id
   ), call_companies AS MATERIALIZED (SELECT company_id FROM scoped_calls GROUP BY company_id HAVING $ct$,o,call_where);
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
  part:='p.id IN (SELECT company_id FROM call_companies)';
  IF no_list AND call_where='' AND nullif(f->>'lastCallFrom','') IS NULL AND nullif(f->>'lastCallTo','') IS NULL
   AND coalesce(nullif(f->>'callCountMin','')::bigint,0)=0 AND coalesce(nullif(f->>'callCountMax','')::bigint,1)>0
  THEN part:=part||format(' OR NOT EXISTS(SELECT 1 FROM public.company_profile_links l WHERE l.org_id=%L::uuid AND l.company_id=p.id AND l.item_id IS NOT NULL)',o); END IF;
  w:=w||' AND ('||part||')';
 END IF;
 col:=coalesce(f->>'sortCol','company_name');
 IF col NOT IN ('id','company_name','revenue_k','net_income_k','employee_count','representative_age','next_action_at') THEN RAISE invalid_parameter_value USING MESSAGE='Invalid sort column'; END IF;
 sdir:=CASE WHEN f->>'sortDir'='desc' THEN 'DESC' ELSE 'ASC' END;
 ord:=(CASE WHEN col IN ('revenue_k','net_income_k','employee_count','representative_age') THEN 'd.' ELSE 'p.' END)||col||' '||sdir||' NULLS LAST,p.id';
 q:=' FROM public.company_profiles p JOIN public.company_directory_search d ON d.company_id=p.id AND d.org_id=p.org_id WHERE '||w;
 IF p_include_count THEN EXECUTE call_cte||'SELECT count(*)'||q INTO n; END IF;
 EXECUTE call_cte||'SELECT coalesce(jsonb_agg(row_data),''[]''::jsonb) FROM (SELECT
  d.values||jsonb_build_object(''id'',p.id,''company_name'',p.company_name,''representative'',p.representative,''phone'',p.phone,
  ''address'',p.address,''business_description'',p.business,''industry'',p.industry,''corporate_number'',p.corporate_number,
  ''prefecture'',d.prefecture,''crm_stage'',p.crm_stage,''home_state'',p.home_state,''address_match'',d.address_match,
  ''needs_review'',p.needs_review,''list_count'',p.list_count,''owner_name'',p.owner_name,''next_action_at'',p.next_action_at,
  ''registry_status'',p.registry_status,''version'',p.version) row_data'||q||' ORDER BY '||ord||format(' LIMIT %s OFFSET %s',p_limit,p_offset)||') page'
 INTO result;
 RETURN jsonb_build_object('count',n,'rows',result);
END; $$;

NOTIFY pgrst,'reload schema';
