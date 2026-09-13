-- Canonical, org-private projection. No client data is copied into company_master.
CREATE FUNCTION public.crm_directory_number(v text) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
 SELECT CASE WHEN length(v)<40 AND replace(trim(normalize(v,NFKC)),',','') ~ '^-?[0-9]+(\.[0-9]+)?$'
 THEN replace(trim(normalize(v,NFKC)),',','')::numeric END;
$$;
CREATE FUNCTION public.crm_directory_memo(v text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN RETURN CASE WHEN jsonb_typeof(v::jsonb)='object' THEN v::jsonb ELSE '{}'::jsonb END;
EXCEPTION WHEN invalid_text_representation THEN RETURN '{}'::jsonb; END;
$$;
CREATE TABLE public.company_directory_search (
 company_id uuid PRIMARY KEY REFERENCES public.company_profiles(id) ON DELETE CASCADE,
 org_id uuid NOT NULL, values jsonb NOT NULL DEFAULT '{}', field_sources jsonb NOT NULL DEFAULT '{}',
 prefecture text NOT NULL DEFAULT '', phone_key text NOT NULL DEFAULT '',
 address_match text NOT NULL CHECK(address_match IN ('same','different','unknown')),
 shareholder_type text NOT NULL DEFAULT 'empty', rep_shareholder_match boolean NOT NULL DEFAULT false,
 identifiers text[] NOT NULL DEFAULT '{}',
 revenue_k numeric GENERATED ALWAYS AS (public.crm_directory_number(values->>'revenue_k')) STORED,
 net_income_k numeric GENERATED ALWAYS AS (public.crm_directory_number(values->>'net_income_k')) STORED,
 ordinary_income_k numeric GENERATED ALWAYS AS (public.crm_directory_number(values->>'ordinary_income_k')) STORED,
 capital_k numeric GENERATED ALWAYS AS (public.crm_directory_number(values->>'capital_k')) STORED,
 employee_count numeric GENERATED ALWAYS AS (public.crm_directory_number(values->>'employee_count')) STORED,
 representative_age numeric GENERATED ALWAYS AS (public.crm_directory_number(values->>'representative_age')) STORED,
 established_year numeric GENERATED ALWAYS AS (public.crm_directory_number(values->>'established_year')) STORED,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_directory_search ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_directory_search FROM anon,authenticated;
CREATE POLICY company_directory_staff_read ON public.company_directory_search FOR SELECT TO authenticated
 USING(org_id=(SELECT public.get_user_org_id()));
GRANT SELECT ON public.company_directory_search TO authenticated;
CREATE INDEX company_directory_org ON public.company_directory_search(org_id,company_id);
CREATE INDEX company_directory_area ON public.company_directory_search(org_id,prefecture,company_id);
CREATE INDEX company_directory_match ON public.company_directory_search(org_id,address_match,company_id);
CREATE INDEX company_directory_revenue ON public.company_directory_search(org_id,revenue_k,company_id);
CREATE INDEX company_directory_income ON public.company_directory_search(org_id,net_income_k,company_id);
CREATE INDEX company_directory_employees ON public.company_directory_search(org_id,employee_count,company_id);
CREATE INDEX company_directory_age ON public.company_directory_search(org_id,representative_age,company_id);
CREATE INDEX company_directory_identifiers ON public.company_directory_search USING gin(identifiers);
CREATE INDEX company_directory_phone ON public.company_directory_search(org_id,phone_key text_pattern_ops);
CREATE INDEX company_directory_industry ON public.company_directory_search(org_id,(values->>'industry_major'),(values->>'industry_sub'));
CREATE INDEX company_directory_source_file ON public.company_profile_links USING gin((source_data->>'source_file') public.gin_trgm_ops);
CREATE INDEX company_directory_latest_call ON public.call_records(item_id,round DESC NULLS LAST,called_at DESC NULLS LAST,id DESC);

CREATE FUNCTION public.crm_refresh_directory(p_ids uuid[]) RETURNS void
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
  coalesce(substring(normalize(p.address,NFKC) from '(北海道|東京都|京都府|大阪府|.{2,3}県)'),''),
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
REVOKE ALL ON FUNCTION public.crm_refresh_directory(uuid[]) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.crm_directory_profile_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.crm_refresh_directory(ARRAY[NEW.id]); RETURN NEW; END; $$;
CREATE TRIGGER crm_directory_profile_refresh AFTER INSERT OR UPDATE ON public.company_profiles
 FOR EACH ROW EXECUTE FUNCTION public.crm_directory_profile_trigger();
CREATE FUNCTION public.crm_directory_values_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];
BEGIN
 IF TG_TABLE_NAME='company_master' THEN SELECT array_agg(DISTINCT company_id) INTO ids FROM public.company_profile_links WHERE master_id=NEW.id;
 ELSE SELECT array_agg(DISTINCT company_id) INTO ids FROM public.company_profile_links WHERE item_id=NEW.id; END IF;
 IF ids IS NOT NULL THEN PERFORM public.crm_refresh_directory(ids); END IF; RETURN NEW;
END; $$;
CREATE TRIGGER crm_directory_master_values AFTER UPDATE OF revenue_k,net_income_k,ordinary_income_k,capital_k,employee_count,
 representative_age,established_year,shareholders,officers,clients,suppliers,postal_code,city,tsr_id ON public.company_master
 FOR EACH ROW EXECUTE FUNCTION public.crm_directory_values_trigger();
CREATE TRIGGER crm_directory_item_values AFTER UPDATE OF revenue,net_income,employees,url ON public.call_list_items
 FOR EACH ROW EXECUTE FUNCTION public.crm_directory_values_trigger();
REVOKE ALL ON FUNCTION public.crm_directory_profile_trigger(),public.crm_directory_values_trigger() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_backfill_directory(p_after uuid DEFAULT NULL,p_limit int DEFAULT 2000) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];
BEGIN
 SELECT array_agg(id ORDER BY id) INTO ids FROM (SELECT id FROM public.company_profiles
 WHERE source_count>0 AND merged_into IS NULL AND (p_after IS NULL OR id>p_after) ORDER BY id LIMIT greatest(1,least(p_limit,10000))) x;
 IF ids IS NULL THEN RETURN jsonb_build_object('count',0,'after',p_after); END IF;
 PERFORM public.crm_refresh_directory(ids);
 RETURN jsonb_build_object('count',cardinality(ids),'after',ids[cardinality(ids)]);
END; $$;
REVOKE ALL ON FUNCTION public.crm_backfill_directory(uuid,int) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_company_directory_values(p_company_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); result jsonb;
BEGIN
 SELECT jsonb_build_object('values',d.values,'sources',coalesce((SELECT jsonb_object_agg(k.key,jsonb_build_object(
  'file',l.source_data->>'source_file','provider',l.source_data->>'provider_name','row',l.source_data->'row'))
 FROM jsonb_each_text(d.field_sources) k JOIN public.company_profile_links l ON l.id=k.value::bigint AND l.org_id=o),'{}'))
 INTO result FROM public.company_directory_search d WHERE d.org_id=o AND d.company_id=p_company_id;
 RETURN coalesce(result,'{}'); END; $$;
REVOKE ALL ON FUNCTION public.get_company_directory_values(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_company_directory_values(uuid) TO authenticated;

ALTER FUNCTION public.classify_shareholder_type(text) SET search_path=public;

CREATE FUNCTION public.crm_directory_like(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT replace(replace(replace(lower(trim(normalize(coalesce(v,''),NFKC))),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
$$;
CREATE FUNCTION public.crm_directory_array(f jsonb,k text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result text[];
BEGIN
 IF f->k IS NULL OR f->k='null'::jsonb THEN RETURN '{}'::text[]; END IF;
 IF jsonb_typeof(f->k)<>'array' OR jsonb_array_length(f->k)>1000 THEN RAISE invalid_parameter_value USING MESSAGE='Invalid filter array: '||k; END IF;
 SELECT coalesce(array_agg(v),'{}') INTO result FROM jsonb_array_elements_text(f->k) v WHERE coalesce(v,'')<>'';
 RETURN result; END; $$;

CREATE FUNCTION public.search_company_directory(p_filters jsonb DEFAULT '{}',p_offset int DEFAULT 0,p_limit int DEFAULT 50,p_include_count boolean DEFAULT true)
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
 IF v IS NOT NULL THEN w:=w||format(' AND d.identifiers @> ARRAY[%L]::text[]',v); END IF;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[
  ['revenue','revenue_k'],['netIncome','net_income_k'],['ordinaryIncome','ordinary_income_k'],['capital','capital_k'],
  ['employee','employee_count'],['age','representative_age'],['established','established_year']] LOOP
  lo:=NULL; hi:=NULL; mode:=coalesce(f->>(spec[1]||'NullMode'),''); parts:='{}'; col:='d.'||spec[2];
  IF mode NOT IN ('','include','exclude','only') THEN RAISE invalid_parameter_value USING MESSAGE='Invalid missing-value filter'; END IF;
  v:=nullif(f->>(spec[1]||'Min'),''); IF v IS NOT NULL THEN lo:=public.crm_directory_number(v); IF lo IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Invalid minimum'; END IF; END IF;
  v:=nullif(f->>(spec[1]||'Max'),''); IF v IS NOT NULL THEN hi:=public.crm_directory_number(v); IF hi IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Invalid maximum'; END IF; END IF;
  IF lo IS NOT NULL AND hi IS NOT NULL AND lo>=hi THEN RAISE invalid_parameter_value USING MESSAGE='上限（未満）は下限より大きい数値を指定してください'; END IF;
  IF mode='only' THEN w:=w||' AND '||col||' IS NULL'; CONTINUE; END IF;
  IF lo IS NOT NULL THEN parts:=array_append(parts,format('%s>=%L::numeric',col,lo)); END IF;
  IF hi IS NOT NULL THEN parts:=array_append(parts,format('%s<%L::numeric',col,hi)); END IF;
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
 IF cardinality(arr)>0 THEN w:=w||format(' AND p.id IN (SELECT l.company_id FROM public.company_profile_links l JOIN public.company_db_labels b ON b.company_master_id=l.master_id AND b.org_id=l.org_id WHERE l.org_id=%L::uuid AND b.label=ANY(%L::text[]))',o,arr); END IF;
 -- Provider/file restrictions apply to the same source, with original values retained.
 v:=nullif(f->>'provider','');
 IF v IS NOT NULL THEN source_where:=source_where||format(' AND l.source_data->>''provider''=%L',v); END IF;
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
REVOKE ALL ON FUNCTION public.search_company_directory(jsonb,int,int,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_company_directory(jsonb,int,int,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE OR REPLACE FUNCTION public.crm_import_standard_fields() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT $json$[{"key":"company_name","label":"企業名","aliases":["会社名","社名","商号","法人名","商号又は名称","企業名称","company name","company","法人名称"],"type":"text","money":false,"active":true},{"key":"representative","label":"代表者","aliases":["代表者名","代表取締役","代表","代表者氏名","representative name"],"type":"text","money":false,"active":true},{"key":"phone","label":"電話番号","aliases":["TEL","電話","会社電話番号","phone number","telephone"],"type":"text","money":false,"active":true},{"key":"address","label":"会社住所","aliases":["住所","所在地","本社所在地","本店所在地","company address","full_address"],"type":"text","money":false,"active":true},{"key":"prefecture","label":"都道府県","aliases":["県"],"type":"text","money":false,"active":true},{"key":"city","label":"市区町村","aliases":["市区郡","市町村","区市町村"],"type":"text","money":false,"active":true},{"key":"street","label":"番地・建物名","aliases":["番地","番地以降","番地・以降","丁目番地"],"type":"text","money":false,"active":true},{"key":"postal_code","label":"郵便番号","aliases":["〒"],"type":"text","money":false,"active":true},{"key":"representative_address","label":"代表者自宅住所","aliases":["代表者現住所","代表者住所","代表者現住所詳細","代表者住所詳細","自宅住所","社長住所","社長自宅住所"],"type":"text","money":false,"active":true},{"key":"corporate_number","label":"法人番号","aliases":["法人番号13桁","corporate_number"],"type":"text","money":false,"active":true},{"key":"business","label":"事業内容","aliases":["事業概要","営業種目","取扱品目","業務内容"],"type":"text","money":false,"active":true},{"key":"industry","label":"業種","aliases":["業種名","主業","業種1","中業種"],"type":"text","money":false,"active":true},{"key":"source_industry_code","label":"出所の業種コード","aliases":["業種コード","産業分類コード"],"type":"text","money":false,"active":true},{"key":"industry_major","label":"業種大分類","aliases":["大分類","大業種"],"type":"text","money":false,"active":true},{"key":"industry_sub","label":"業種細分類","aliases":["細分類"],"type":"text","money":false,"active":true},{"key":"source_company_code","label":"提供元の企業コード","aliases":["顧客番号","顧客コード","顧客ID","customer_id","company code"],"type":"text","money":false,"active":true},{"key":"tsr_code","label":"TSR企業コード","aliases":["TSRID","TSRコード","tsr_id"],"type":"text","money":false,"active":true},{"key":"tdb_code","label":"TDB企業コード","aliases":["TDBコード","帝国企業コード"],"type":"text","money":false,"active":true},{"key":"revenue_k","label":"売上高","aliases":["売上","最新売上","直近売上","売上金額","売上千円"],"type":"number","money":true,"active":true},{"key":"net_income_k","label":"当期純利益","aliases":["純利益","最新利益","当期利益","最新純利益"],"type":"number","money":true,"active":true},{"key":"ordinary_income_k","label":"経常利益","aliases":[],"type":"number","money":true,"active":true},{"key":"capital_k","label":"資本金","aliases":[],"type":"number","money":true,"active":true},{"key":"employee_count","label":"従業員数","aliases":["社員数","従業員"],"type":"number","money":false,"active":true},{"key":"representative_age","label":"代表者年齢","aliases":["年齢"],"type":"number","money":false,"active":true},{"key":"established_year","label":"設立年","aliases":["設立","設立年度"],"type":"text","money":false,"active":true},{"key":"url","label":"ホームページ","aliases":["URL","HP","会社URL","会社HP"],"type":"text","money":false,"active":true},{"key":"shareholders","label":"株主","aliases":[],"type":"text","money":false,"active":true},{"key":"officers","label":"役員","aliases":[],"type":"text","money":false,"active":true},{"key":"clients","label":"取引先","aliases":[],"type":"text","money":false,"active":true},{"key":"remarks","label":"備考","aliases":["メモ","注記"],"type":"text","money":false,"active":true}]$json$::jsonb $fn$;

CREATE OR REPLACE FUNCTION public.crm_normalize_import_row(p_values jsonb,p_metadata jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb:='{}'; col record; f jsonb; v text; n numeric; factor numeric; k text; address text; pref text; city text;
BEGIN
  FOR col IN SELECT value,ordinality FROM jsonb_array_elements(p_metadata->'mapping') WITH ORDINALITY LOOP
    k:=col.value->>'key'; IF coalesce(k,'')='' THEN CONTINUE; END IF;
    v:=trim(coalesce(p_values->>(col.ordinality::integer-1),'')); IF v='' THEN CONTINUE; END IF;
    SELECT value INTO f FROM jsonb_array_elements(p_metadata->'fields') WHERE value->>'key'=k;
    IF f->>'type'='number' THEN
      v:=replace(normalize(v,NFKC),',','');
      IF v !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RAISE invalid_parameter_value USING MESSAGE=(f->>'label')||'を数値で指定してください'; END IF;
      factor:=CASE WHEN (f->>'money')::boolean IS TRUE THEN CASE col.value->>'unit' WHEN '円' THEN .001 WHEN '万円' THEN 10 WHEN '百万円' THEN 1000 WHEN '億円' THEN 100000 ELSE 1 END ELSE 1 END;
      n:=v::numeric*factor; IF abs(n)>1e14 THEN RAISE numeric_value_out_of_range USING MESSAGE=(f->>'label')||'の数値が範囲外です'; END IF;
      result:=result||jsonb_build_object(k,n);
    ELSIF f->>'type'='date' THEN
      v:=replace(normalize(v,NFKC),'/','-');
      IF v !~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' THEN RAISE invalid_parameter_value USING MESSAGE=(f->>'label')||'を年月日で指定してください'; END IF;
      result:=result||jsonb_build_object(k,(v::date)::text);
    ELSE
      IF k='phone' THEN
        v:=normalize(v,NFKC);
        IF v !~ '^[+0-9\s()\-‐‑‒–—―−ー]+$' THEN RAISE invalid_parameter_value USING MESSAGE='電話番号の形式を確認してください'; END IF;
        IF v LIKE '+81%' THEN v:='0'||regexp_replace(substring(regexp_replace(v,'[^0-9]','','g') FROM 3),'^0','');
        ELSE v:=regexp_replace(v,'[^0-9]','','g'); IF v ~ '^[1-9][0-9]{8,9}$' THEN v:='0'||v; END IF; END IF;
        IF v !~ '^0[0-9]{9,10}$' THEN RAISE invalid_parameter_value USING MESSAGE='電話番号の桁数を確認してください'; END IF;
      END IF;
      result:=result||jsonb_build_object(k,v);
    END IF;
  END LOOP;
  IF coalesce(result->>'company_name','')='' THEN RAISE invalid_parameter_value USING MESSAGE='企業名がありません'; END IF;
  address:=coalesce(result->>'address',''); pref:=coalesce(result->>'prefecture',''); city:=coalesce(result->>'city','');
  IF address<>'' THEN
    IF city<>'' AND left(address,length(pref||city))<>pref||city AND left(address,length(city))<>city AND (pref='' OR left(address,length(pref))<>pref) THEN address:=city||address; END IF;
    IF pref<>'' AND left(address,length(pref))<>pref THEN address:=pref||address; END IF;
  ELSE address:=pref||city||coalesce(result->>'street',''); END IF;
  IF address<>'' THEN result:=result||jsonb_build_object('address',regexp_replace(address,'[／/]\s*$','')); END IF;
  IF coalesce(result->>'industry','')='' THEN result:=result||jsonb_strip_nulls(jsonb_build_object('industry',coalesce(result->>'industry_sub',result->>'industry_major'))); END IF;
  RETURN result;
END; $$;

