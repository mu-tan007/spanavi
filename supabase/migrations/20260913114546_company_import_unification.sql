-- Organization-private import configuration and immutable source rows. Both
-- company DB and call lists resolve to company_profiles through the same matcher.
SET LOCAL lock_timeout='5s';
CREATE TABLE public.company_import_fields (
  org_id uuid NOT NULL, key text NOT NULL, label text NOT NULL, type text NOT NULL CHECK(type IN ('text','number','date')),
  aliases jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,key),
  CHECK(key ~ '^custom_[a-z0-9_]{1,64}$'), CHECK(length(label) BETWEEN 1 AND 80), CHECK(jsonb_typeof(aliases)='array')
);
CREATE TABLE public.company_import_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, provider text NOT NULL,
  name text NOT NULL, settings jsonb NOT NULL, version integer NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,provider,name),
  CHECK(provider IN ('client','tsr','tdb','other')), CHECK(length(name) BETWEEN 1 AND 120)
);
CREATE INDEX company_import_templates_org ON public.company_import_templates(org_id,updated_at DESC);
CREATE TABLE public.company_import_batches (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, list_id uuid, metadata jsonb NOT NULL, fingerprint text NOT NULL,
  total integer NOT NULL CHECK(total BETWEEN 1 AND 500000), processed integer NOT NULL DEFAULT 0,
  saved integer NOT NULL DEFAULT 0, rejected integer NOT NULL DEFAULT 0, first_no integer, last_no integer,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id), UNIQUE(org_id,fingerprint), CHECK(fingerprint ~ '^[a-f0-9]{64}$')
);
CREATE INDEX company_import_batches_org ON public.company_import_batches(org_id,created_at DESC);
CREATE TABLE public.company_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, batch_id uuid NOT NULL,
  row_no integer NOT NULL CHECK(row_no>0), source_row integer NOT NULL CHECK(source_row>0),
  raw_values jsonb NOT NULL, normalized jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','saved','rejected')), error text,
  item_id uuid UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id), UNIQUE(batch_id,row_no),
  FOREIGN KEY(org_id,batch_id) REFERENCES public.company_import_batches(org_id,id),
  CHECK(jsonb_typeof(raw_values)='array')
);
ALTER TABLE public.company_profile_links ADD COLUMN import_row_id uuid;
ALTER TABLE public.company_profile_links ADD CONSTRAINT company_profile_links_import_row_fk
  FOREIGN KEY(org_id,import_row_id) REFERENCES public.company_import_rows(org_id,id);
CREATE UNIQUE INDEX company_profile_links_import_row ON public.company_profile_links(import_row_id) WHERE import_row_id IS NOT NULL;
ALTER TABLE public.company_profile_links DROP CONSTRAINT company_profile_links_check;
ALTER TABLE public.company_profile_links ADD CONSTRAINT company_profile_links_check CHECK(
  (master_id IS NOT NULL AND item_id IS NULL AND list_id IS NULL AND import_row_id IS NULL)
  OR (master_id IS NULL AND item_id IS NOT NULL AND list_id IS NOT NULL)
  OR (master_id IS NULL AND item_id IS NULL AND list_id IS NULL AND import_row_id IS NOT NULL)
) NOT VALID;

ALTER TABLE public.company_import_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_import_fields_staff_read ON public.company_import_fields FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
CREATE POLICY company_import_templates_staff_read ON public.company_import_templates FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
CREATE POLICY company_import_batches_staff_read ON public.company_import_batches FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
CREATE POLICY company_import_rows_staff_read ON public.company_import_rows FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
REVOKE ALL ON public.company_import_fields,public.company_import_templates,public.company_import_batches,public.company_import_rows FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.company_import_fields,public.company_import_templates,public.company_import_batches,public.company_import_rows TO authenticated;

CREATE FUNCTION public.crm_import_standard_fields() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$ SELECT $json$[{"key":"company_name","label":"企業名","aliases":["会社名","社名","商号","法人名","商号又は名称","企業名称"],"type":"text","money":false,"active":true},{"key":"representative","label":"代表者","aliases":["代表者名","代表取締役","代表"],"type":"text","money":false,"active":true},{"key":"phone","label":"電話番号","aliases":["TEL","電話","会社電話番号"],"type":"text","money":false,"active":true},{"key":"address","label":"会社住所","aliases":["住所","所在地","本社所在地","本店所在地"],"type":"text","money":false,"active":true},{"key":"prefecture","label":"都道府県","aliases":["県"],"type":"text","money":false,"active":true},{"key":"city","label":"市区町村","aliases":["市区郡","市町村","区市町村"],"type":"text","money":false,"active":true},{"key":"street","label":"番地・建物名","aliases":["番地","番地以降","番地・以降","丁目番地"],"type":"text","money":false,"active":true},{"key":"postal_code","label":"郵便番号","aliases":["〒"],"type":"text","money":false,"active":true},{"key":"representative_address","label":"代表者自宅住所","aliases":["代表者現住所","代表者住所","代表者現住所詳細","代表者住所詳細","自宅住所","社長住所","社長自宅住所"],"type":"text","money":false,"active":true},{"key":"corporate_number","label":"法人番号","aliases":["法人番号13桁","corporate_number"],"type":"text","money":false,"active":true},{"key":"business","label":"事業内容","aliases":["事業概要","営業種目","取扱品目","業務内容"],"type":"text","money":false,"active":true},{"key":"industry","label":"業種","aliases":["業種名","業種細分類","主業","業種1","中業種"],"type":"text","money":false,"active":true},{"key":"source_industry_code","label":"出所の業種コード","aliases":["業種コード","産業分類コード"],"type":"text","money":false,"active":true},{"key":"tsr_code","label":"TSR企業コード","aliases":["TSRID","TSRコード","tsr_id"],"type":"text","money":false,"active":true},{"key":"tdb_code","label":"TDB企業コード","aliases":["TDBコード","帝国企業コード"],"type":"text","money":false,"active":true},{"key":"revenue_k","label":"売上高","aliases":["売上","最新売上","直近売上","売上金額","売上千円"],"type":"number","money":true,"active":true},{"key":"net_income_k","label":"当期純利益","aliases":["純利益","最新利益","当期利益","最新純利益"],"type":"number","money":true,"active":true},{"key":"ordinary_income_k","label":"経常利益","aliases":[],"type":"number","money":true,"active":true},{"key":"capital_k","label":"資本金","aliases":[],"type":"number","money":true,"active":true},{"key":"employee_count","label":"従業員数","aliases":["社員数","従業員"],"type":"number","money":false,"active":true},{"key":"representative_age","label":"代表者年齢","aliases":["年齢"],"type":"number","money":false,"active":true},{"key":"established_year","label":"設立年","aliases":["設立","設立年度"],"type":"text","money":false,"active":true},{"key":"url","label":"ホームページ","aliases":["URL","HP","会社URL","会社HP"],"type":"text","money":false,"active":true},{"key":"shareholders","label":"株主","aliases":[],"type":"text","money":false,"active":true},{"key":"officers","label":"役員","aliases":[],"type":"text","money":false,"active":true},{"key":"clients","label":"取引先","aliases":[],"type":"text","money":false,"active":true},{"key":"remarks","label":"備考","aliases":["メモ","注記"],"type":"text","money":false,"active":true}]$json$::jsonb $fn$;

CREATE FUNCTION public.company_import_config() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org();
BEGIN
  RETURN jsonb_build_object('can_manage',public.is_admin(),
    'fields',public.crm_import_standard_fields()||coalesce((SELECT jsonb_agg(to_jsonb(f)-'org_id' ORDER BY f.label) FROM public.company_import_fields f WHERE org_id=o),'[]'),
    'templates',coalesce((SELECT jsonb_agg(to_jsonb(t)-'org_id' ORDER BY t.updated_at DESC) FROM public.company_import_templates t WHERE org_id=o),'[]'),
    'jobs',coalesce((SELECT jsonb_agg(x) FROM (SELECT id,metadata->>'fileName' file_name,total,processed,saved,rejected,created_at FROM public.company_import_batches WHERE org_id=o ORDER BY created_at DESC LIMIT 20) x),'[]'));
END; $$;
CREATE FUNCTION public.save_company_import_field(p_key text,p_label text,p_type text,p_aliases jsonb,p_active boolean,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); old public.company_import_fields; r public.company_import_fields;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN RAISE insufficient_privilege USING MESSAGE='項目の管理は管理者のみ実行できます'; END IF;
  IF length(trim(p_label)) NOT BETWEEN 1 AND 80 OR jsonb_typeof(p_aliases) IS DISTINCT FROM 'array' OR jsonb_array_length(p_aliases)>50
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_aliases) a WHERE jsonb_typeof(a)<>'string' OR length(a#>>'{}')>120) THEN
    RAISE invalid_parameter_value USING MESSAGE='項目名と列名の候補を確認してください'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(o::text,872));
  SELECT * INTO old FROM public.company_import_fields WHERE org_id=o AND key=p_key;
  IF old.key IS NULL THEN
    IF p_version<>0 THEN RAISE serialization_failure USING MESSAGE='項目が変更されました。再読み込みしてください'; END IF;
    INSERT INTO public.company_import_fields(org_id,key,label,type,aliases,active) VALUES(o,p_key,trim(p_label),p_type,p_aliases,p_active) RETURNING * INTO r;
  ELSE
    IF old.version<>p_version OR old.type<>p_type THEN RAISE serialization_failure USING MESSAGE='型は変更できません。項目を再読み込みしてください'; END IF;
    UPDATE public.company_import_fields SET label=trim(p_label),aliases=p_aliases,active=p_active,version=version+1,updated_at=now()
      WHERE org_id=o AND key=p_key RETURNING * INTO r;
  END IF;
  RETURN to_jsonb(r)-'org_id';
END; $$;
CREATE FUNCTION public.save_company_import_template(p_id uuid,p_provider text,p_name text,p_settings jsonb,p_active boolean,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); old public.company_import_templates; r public.company_import_templates; v_settings jsonb;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN RAISE insufficient_privilege USING MESSAGE='取込設定の管理は管理者のみ実行できます'; END IF;
  IF jsonb_typeof(p_settings->'columns') IS DISTINCT FROM 'array' OR jsonb_array_length(p_settings->'columns')>256 OR length(p_settings::text)>100000 THEN
    RAISE invalid_parameter_value USING MESSAGE='取込設定を確認してください'; END IF;
  -- Only rules are remembered; never rows or original company values.
  SELECT jsonb_build_object('columns',coalesce(jsonb_agg(jsonb_build_object('header',c->>'header','occurrence',(c->>'occurrence')::integer,
    'rule',jsonb_strip_nulls(jsonb_build_object('key',c->'rule'->>'key','unit',c->'rule'->>'unit','unitConfirmed',c->'rule'->'unitConfirmed')))),'[]'))
    INTO v_settings FROM jsonb_array_elements(p_settings->'columns') c;
  PERFORM pg_advisory_xact_lock(hashtextextended(o::text,872));
  SELECT * INTO old FROM public.company_import_templates WHERE id=p_id AND org_id=o;
  IF old.id IS NULL THEN
    IF p_version<>0 THEN RAISE serialization_failure USING MESSAGE='取込設定を再読み込みしてください'; END IF;
    INSERT INTO public.company_import_templates(id,org_id,provider,name,settings,active) VALUES(p_id,o,p_provider,trim(p_name),v_settings,p_active) RETURNING * INTO r;
  ELSE
    IF old.version<>p_version OR old.provider<>p_provider THEN RAISE serialization_failure USING MESSAGE='取込設定が変更されました。再読み込みしてください'; END IF;
    UPDATE public.company_import_templates SET name=trim(p_name),settings=v_settings,active=p_active,version=version+1,updated_at=now()
      WHERE id=p_id AND org_id=o RETURNING * INTO r;
  END IF;
  RETURN to_jsonb(r)-'org_id';
END; $$;

CREATE FUNCTION public.begin_company_import(p_id uuid,p_list_id uuid,p_metadata jsonb,p_total integer,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); m jsonb; fields jsonb; f jsonb; col jsonb; used text[]:='{}'; j public.company_import_batches;
BEGIN
  IF p_list_id IS NULL AND public.is_admin() IS NOT TRUE THEN RAISE insufficient_privilege USING MESSAGE='企業DBの取込は管理者のみ実行できます'; END IF;
  IF p_list_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.call_lists WHERE org_id=o AND id=p_list_id) THEN RAISE insufficient_privilege USING MESSAGE='架電リストが見つかりません'; END IF;
  IF jsonb_typeof(p_metadata) IS DISTINCT FROM 'object' OR coalesce(p_metadata->>'provider','') NOT IN ('client','tsr','tdb','other')
    OR coalesce(length(trim(p_metadata->>'fileName')),0)=0 OR length(p_metadata::text)>200000
    OR jsonb_typeof(p_metadata->'headers') IS DISTINCT FROM 'array' OR jsonb_array_length(p_metadata->'headers') NOT BETWEEN 1 AND 256
    OR jsonb_typeof(p_metadata->'mapping') IS DISTINCT FROM 'array' OR jsonb_array_length(p_metadata->'mapping')<>jsonb_array_length(p_metadata->'headers') THEN
    RAISE invalid_parameter_value USING MESSAGE='ファイルと列の設定を確認してください'; END IF;
  fields:=public.crm_import_standard_fields()||coalesce((SELECT jsonb_agg(to_jsonb(t)-'org_id') FROM public.company_import_fields t WHERE org_id=o AND active),'[]');
  FOR col IN SELECT value FROM jsonb_array_elements(p_metadata->'mapping') LOOP
    IF coalesce(col->>'key','')='' THEN CONTINUE; END IF;
    SELECT value INTO f FROM jsonb_array_elements(fields) WHERE value->>'key'=col->>'key';
    IF f IS NULL OR col->>'key'=ANY(used) THEN RAISE invalid_parameter_value USING MESSAGE='取込先の重複または無効な項目があります'; END IF;
    used:=array_append(used,col->>'key');
    IF (f->>'money')::boolean IS TRUE AND (coalesce(col->>'unit','') NOT IN ('円','千円','万円','百万円','億円') OR coalesce((col->>'unitConfirmed')::boolean,false) IS NOT TRUE) THEN
      RAISE invalid_parameter_value USING MESSAGE='金額の単位を確認してください'; END IF;
    IF (col->>'key'='tsr_code' AND p_metadata->>'provider'='tdb') OR (col->>'key'='tdb_code' AND p_metadata->>'provider'='tsr') THEN
      RAISE invalid_parameter_value USING MESSAGE='企業コードの出所を確認してください'; END IF;
  END LOOP;
  IF NOT 'company_name'=ANY(used) THEN RAISE invalid_parameter_value USING MESSAGE='企業名の列を選択してください'; END IF;
  m:=jsonb_build_object('provider',p_metadata->>'provider','providerName',left(coalesce(p_metadata->>'providerName',''),120),
    'fileName',left(p_metadata->>'fileName',255),'sheetName',left(coalesce(p_metadata->>'sheetName',''),255),
    'headers',p_metadata->'headers','mapping',p_metadata->'mapping','fields',fields);
  INSERT INTO public.company_import_batches(id,org_id,list_id,metadata,fingerprint,total,created_by)
    VALUES(p_id,o,p_list_id,m,p_fingerprint,p_total,auth.uid()) ON CONFLICT(org_id,fingerprint) DO NOTHING;
  SELECT * INTO j FROM public.company_import_batches WHERE org_id=o AND fingerprint=p_fingerprint;
  -- A retry may use the now-updated field dictionary; frozen field types remain
  -- attached to this original import. Other metadata must match exactly.
  IF j.list_id IS DISTINCT FROM p_list_id OR j.total<>p_total OR j.metadata-'fields' IS DISTINCT FROM m-'fields' THEN
    RAISE invalid_parameter_value USING MESSAGE='同じ取込の内容が変わっています。ファイルを選び直してください'; END IF;
  RETURN to_jsonb(j)-ARRAY['org_id','created_by'];
END; $$;

CREATE FUNCTION public.crm_normalize_import_row(p_values jsonb,p_metadata jsonb) RETURNS jsonb
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
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.crm_sync_source(p_org uuid,p_master_id bigint DEFAULT NULL,p_item_id uuid DEFAULT NULL,p_extra jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  ir uuid; imported public.company_import_rows; import_meta jsonb; home_rk text; raw jsonb; memo jsonb; d jsonb; old_link public.company_profile_links; target uuid; candidates uuid[];
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
  ELSIF p_item_id IS NULL AND p_master_id IS NULL AND p_extra ? '_import_row_id' THEN
    ir:=(p_extra->>'_import_row_id')::uuid;
    SELECT * INTO imported FROM public.company_import_rows WHERE org_id=p_org AND id=ir;
    IF imported.id IS NULL THEN RETURN NULL; END IF;
    d:=jsonb_build_object('company_name',imported.normalized->>'company_name','representative',coalesce(imported.normalized->>'representative',''),
      'phone',coalesce(imported.normalized->>'phone',''),'address',coalesce(imported.normalized->>'address',''),
      'business',coalesce(imported.normalized->>'business',''),'industry',coalesce(imported.normalized->>'industry',''));
    memo:=imported.normalized; v_source_key:='import:'||ir;
  ELSE RAISE invalid_parameter_value USING MESSAGE='One source is required'; END IF;
  IF p_item_id IS NOT NULL THEN SELECT * INTO imported FROM public.company_import_rows WHERE org_id=p_org AND item_id=p_item_id; ir:=imported.id; END IF;
  IF ir IS NOT NULL THEN
    SELECT metadata INTO import_meta FROM public.company_import_batches WHERE org_id=p_org AND id=imported.batch_id;
    d:=d||jsonb_build_object('source_file',import_meta->>'fileName','provider',import_meta->>'provider',
      'provider_name',import_meta->>'providerName','sheet',import_meta->>'sheetName','row',imported.source_row,
      'industry',coalesce(imported.normalized->>'industry',d->>'industry',''));
  END IF;
  IF jsonb_typeof(memo) IS DISTINCT FROM 'object' THEN memo:='{}'; END IF;
  memo:=memo||coalesce(p_extra,'{}');
  nk:=public.crm_identity_name(d->>'company_name'); rk:=public.crm_identity_representative(d->>'representative');
  home_rk:=CASE WHEN ir IS NOT NULL THEN public.crm_identity_representative(imported.normalized->>'representative') ELSE rk END;
  pk:=public.crm_identity_phone(d->>'phone'); ak:=public.crm_identity_address(d->>'address'); lf:=public.crm_legal_form(d->>'company_name');
  SELECT array_agg(DISTINCT public.crm_corporate_number(value)) FILTER(WHERE public.crm_corporate_number(value) IS NOT NULL) INTO numbers
    FROM jsonb_each_text(memo) WHERE public.crm_identity_text(key) IN ('法人番号','corporate_number','corporatenumber');
  cn:=CASE WHEN cardinality(numbers)=1 THEN numbers[1] ELSE NULL END; conflict:=coalesce(cardinality(numbers)>1,false);
  FOR entry IN SELECT key,value FROM jsonb_each(memo) LOOP
    normalized:=lower(regexp_replace(normalize(entry.key,NFKC),'[\s()（）]','','g'));
    IF normalized=ANY(ARRAY['代表者自宅住所','代表者現住所','代表者現住所詳細','代表者住所詳細','代表者住所','代表者居住地',
      '社長自宅住所','社長住所','自宅住所','representative_address','representative_home_address','president_address']) AND jsonb_typeof(entry.value)='string' THEN
      new_facts:=new_facts||jsonb_build_array(jsonb_build_object('field','representative_address','key',entry.key,
        'value',entry.value#>>'{}','normalized',public.crm_identity_address(entry.value#>>'{}'),'representative_key',home_rk));
    ELSIF normalized=ANY(ARRAY['法人番号','corporate_number','corporatenumber']) AND jsonb_typeof(entry.value) IN ('string','number') AND public.crm_identity_text(entry.value#>>'{}')<>'' THEN
      new_facts:=new_facts||jsonb_build_array(jsonb_build_object('field','corporate_number','key',entry.key,
        'value',entry.value#>>'{}','normalized',coalesce(public.crm_corporate_number(entry.value#>>'{}'),''),'representative_key',''));
    END IF;
  END LOOP;
  SELECT array_agg(DISTINCT value->>'normalized') FILTER(WHERE value->>'normalized'<>'') INTO homes
    FROM jsonb_array_elements(new_facts) WHERE value->>'field'='representative_address' AND value->>'representative_key'=rk;
  -- Serialize matching for concurrent imports in this organization. No full-table
  -- scan or call-history work occurs inside an import transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text,871));
  SELECT * INTO old_link FROM public.company_profile_links
    WHERE org_id=p_org AND ((p_master_id IS NOT NULL AND master_id=p_master_id) OR (p_item_id IS NOT NULL AND item_id=p_item_id) OR (ir IS NOT NULL AND import_row_id=ir));
  IF old_link.id IS NOT NULL AND old_link.name_key=nk AND old_link.representative_key=rk AND old_link.phone_key=pk
    AND old_link.address_key=ak AND (cn IS NULL OR old_link.corporate_number=cn) THEN
    target:=old_link.company_id;
  ELSE
    SELECT array_agg(DISTINCT company_id) INTO candidates FROM (
      SELECT company_id FROM public.company_profile_links WHERE org_id=p_org AND cn IS NOT NULL AND corporate_number=cn
      UNION SELECT id FROM public.company_profiles WHERE org_id=p_org AND cn IS NOT NULL AND corporate_number=cn AND merged_into IS NULL
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=p_org AND nk<>'' AND name_key<>'' AND phone_key<>'' AND name_key=nk AND pk<>'' AND phone_key=pk
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=p_org AND nk<>'' AND name_key<>'' AND representative_key<>'' AND name_key=nk AND rk<>'' AND representative_key=rk
      UNION SELECT company_id FROM public.company_profile_links WHERE org_id=p_org AND nk<>'' AND name_key<>'' AND name_key=nk AND ak<>'' AND address_key<>'' AND md5(address_key)=md5(ak) AND address_key=ak
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
    UPDATE public.company_profile_links SET company_id=target,import_row_id=ir,list_id=li,sort_no=seq,name_key=nk,representative_key=rk,
      phone_key=pk,address_key=ak,corporate_number=coalesce(cn,old_link.corporate_number),legal_form=lf,source_data=d,
      local_home_key=CASE WHEN cardinality(homes)=1 THEN homes[1] ELSE '' END,
      local_home_state=CASE WHEN cardinality(homes)>1 THEN 'conflict' WHEN cardinality(homes)=1 THEN 'available' ELSE 'unknown' END,
      updated_at=now() WHERE id=old_link.id;
  ELSE
    INSERT INTO public.company_profile_links(org_id,company_id,master_id,item_id,import_row_id,list_id,sort_no,name_key,representative_key,phone_key,address_key,
      corporate_number,legal_form,source_data,local_home_key,local_home_state,link_reason)
    VALUES(p_org,target,p_master_id,p_item_id,ir,li,seq,nk,rk,pk,ak,cn,lf,d,CASE WHEN cardinality(homes)=1 THEN homes[1] ELSE '' END,
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
        jsonb_build_object('kind',CASE WHEN ir IS NOT NULL THEN 'company_import' WHEN p_item_id IS NULL THEN 'master_import' ELSE 'call_list' END,'label',d->>'source_file',
          'row',imported.source_row,'sheet',import_meta->>'sheetName','provider',import_meta->>'provider',
          'record_id',coalesce(p_item_id::text,p_master_id::text,ir::text),'record_key',v_source_key,'field',entry.value->>'key'))
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

CREATE FUNCTION public.get_company_import_job(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); j public.company_import_batches;
BEGIN
  SELECT * INTO j FROM public.company_import_batches WHERE org_id=o AND id=p_id;
  IF j.id IS NULL THEN RAISE no_data_found USING MESSAGE='取込記録が見つかりません'; END IF;
  RETURN (to_jsonb(j)-ARRAY['org_id','created_by'])||jsonb_build_object('totalCount',CASE WHEN j.list_id IS NOT NULL THEN (SELECT count(*) FROM public.call_list_items WHERE org_id=o AND list_id=j.list_id) END,
    'errors',coalesce((SELECT jsonb_agg(x) FROM (SELECT row_no,source_row,error FROM public.company_import_rows WHERE org_id=o AND batch_id=j.id AND state='rejected' ORDER BY row_no LIMIT 100) x),'[]'));
END; $$;
CREATE FUNCTION public.append_company_import(p_id uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<import_batch>>
DECLARE o uuid:=public.crm_require_org(); j public.company_import_batches; r jsonb; old public.company_import_rows; rid uuid; iid uuid; cid uuid;
  n integer; seq integer; v jsonb; saved integer:=0; rejected integer:=0; first_no integer; last_no integer; msg text;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 25 OR length(p_rows::text)>2000000 THEN
    RAISE invalid_parameter_value USING MESSAGE='取込は25行ずつ実行してください'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(o::text,871));
  SELECT * INTO j FROM public.company_import_batches WHERE org_id=o AND id=p_id FOR UPDATE;
  IF j.id IS NULL THEN RAISE no_data_found USING MESSAGE='取込記録が見つかりません'; END IF;
  IF j.list_id IS NULL AND public.is_admin() IS NOT TRUE THEN RAISE insufficient_privilege USING MESSAGE='企業DBの取込は管理者のみ実行できます'; END IF;
  IF j.list_id IS NOT NULL THEN
    PERFORM 1 FROM public.call_lists WHERE org_id=o AND id=j.list_id FOR UPDATE;
    IF NOT FOUND THEN RAISE no_data_found USING MESSAGE='架電リストが見つかりません'; END IF;
    SELECT coalesce(max(no),0) INTO seq FROM public.call_list_items WHERE org_id=o AND list_id=j.list_id;
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    n:=(r->>'row_no')::integer;
    IF n NOT BETWEEN 1 AND j.total OR jsonb_typeof(r->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'values')>256
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'values') c WHERE jsonb_typeof(c)<>'string') THEN RAISE invalid_parameter_value USING MESSAGE='元の行データを確認してください'; END IF;
    SELECT * INTO old FROM public.company_import_rows WHERE batch_id=j.id AND row_no=n AND org_id=o;
    IF old.id IS NOT NULL THEN
      IF old.raw_values IS DISTINCT FROM r->'values' OR old.source_row<>(r->>'source_row')::integer THEN RAISE invalid_parameter_value USING MESSAGE='保存済みの行と内容が異なります'; END IF;
      CONTINUE;
    END IF;
    IF n<>j.processed+saved+rejected+1 THEN RAISE invalid_parameter_value USING MESSAGE='取込は先頭から順に実行してください'; END IF;
    INSERT INTO public.company_import_rows(org_id,batch_id,row_no,source_row,raw_values) VALUES(o,j.id,n,(r->>'source_row')::integer,r->'values') RETURNING id INTO rid;
    BEGIN
      v:=public.crm_normalize_import_row(r->'values',j.metadata);
      iid:=CASE WHEN j.list_id IS NOT NULL THEN gen_random_uuid() END;
      UPDATE public.company_import_rows SET normalized=v,item_id=iid WHERE org_id=o AND id=rid;
      IF iid IS NOT NULL THEN
        INSERT INTO public.call_list_items(id,org_id,list_id,no,company,business,representative,phone,address,revenue,net_income,employees,url,memo)
        VALUES(iid,o,j.list_id,seq+1,v->>'company_name',coalesce(v->>'business',v->>'industry',''),coalesce(v->>'representative',''),coalesce(v->>'phone',''),coalesce(v->>'address',''),
          (v->>'revenue_k')::numeric,(v->>'net_income_k')::numeric,(v->>'employee_count')::integer,nullif(v->>'url',''),
          jsonb_strip_nulls(jsonb_build_object('representative_address',v->'representative_address','corporate_number',v->'corporate_number','biko',v->'remarks'))::text);
        -- Ensure registration even for an organization not in the initial seed.
        IF NOT EXISTS(SELECT 1 FROM public.company_profile_links WHERE org_id=o AND item_id=iid) THEN PERFORM public.crm_sync_source(o,NULL,iid); END IF;
        seq:=seq+1; first_no:=coalesce(first_no,seq); last_no:=seq;
      ELSE
        cid:=public.crm_sync_source(o,NULL,NULL,jsonb_build_object('_import_row_id',rid));
        IF cid IS NULL THEN RAISE no_data_found USING MESSAGE='企業DBへの登録を確認できませんでした'; END IF;
      END IF;
      UPDATE public.company_import_rows SET state='saved' WHERE org_id=o AND id=rid;
      saved:=saved+1;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
      UPDATE public.company_import_rows SET state='rejected',error=left(msg,500),item_id=NULL WHERE org_id=o AND id=rid;
      rejected:=rejected+1;
    END;
  END LOOP;
  UPDATE public.company_import_batches b SET processed=b.processed+import_batch.saved+import_batch.rejected,saved=b.saved+import_batch.saved,rejected=b.rejected+import_batch.rejected,
    first_no=coalesce(b.first_no,import_batch.first_no),last_no=coalesce(import_batch.last_no,b.last_no),updated_at=now() WHERE b.id=j.id AND b.org_id=o;
  IF j.list_id IS NOT NULL AND saved>0 THEN UPDATE public.call_lists SET total_count=(SELECT count(*) FROM public.call_list_items WHERE org_id=o AND list_id=j.list_id) WHERE org_id=o AND id=j.list_id; END IF;
  -- Progress counters are maintained atomically; do not count all prior rows for
  -- every 25-row chunk on a 500k-row workbook.
  RETURN (SELECT to_jsonb(b)-ARRAY['org_id','created_by','metadata'] FROM public.company_import_batches b WHERE org_id=o AND id=j.id);
END; $$;

-- Deleting/replacing a list must not remove companies already registered by an
-- import. Detach the list reference before the existing cascading FKs fire.
CREATE FUNCTION public.crm_preserve_import_on_item_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid;
BEGIN
  UPDATE public.company_profile_links SET item_id=NULL,list_id=NULL,sort_no=NULL WHERE org_id=OLD.org_id AND item_id=OLD.id AND import_row_id IS NOT NULL RETURNING company_id INTO cid;
  UPDATE public.company_import_rows SET item_id=NULL WHERE org_id=OLD.org_id AND item_id=OLD.id;
  IF cid IS NOT NULL THEN PERFORM public.crm_refresh_company(cid); END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER crm_preserve_import_on_item_delete BEFORE DELETE ON public.call_list_items FOR EACH ROW EXECUTE FUNCTION public.crm_preserve_import_on_item_delete();

CREATE FUNCTION public.crm_preserve_import_on_list_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; cid uuid;
BEGIN
  SELECT array_agg(DISTINCT company_id) INTO ids FROM public.company_profile_links WHERE org_id=OLD.org_id AND list_id=OLD.id AND import_row_id IS NOT NULL;
  UPDATE public.company_import_rows r SET item_id=NULL FROM public.company_profile_links l WHERE l.org_id=OLD.org_id AND l.list_id=OLD.id AND l.import_row_id=r.id AND r.org_id=l.org_id;
  UPDATE public.company_profile_links SET item_id=NULL,list_id=NULL,sort_no=NULL WHERE org_id=OLD.org_id AND list_id=OLD.id AND import_row_id IS NOT NULL;
  FOREACH cid IN ARRAY coalesce(ids,'{}'::uuid[]) LOOP PERFORM public.crm_refresh_company(cid); END LOOP;
  RETURN OLD;
END; $$;
CREATE TRIGGER crm_preserve_import_on_list_delete BEFORE DELETE ON public.call_lists FOR EACH ROW EXECUTE FUNCTION public.crm_preserve_import_on_list_delete();

CREATE FUNCTION public.get_company_import_sources(p_company_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org();
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.company_profiles WHERE org_id=o AND id=p_company_id) THEN RAISE no_data_found USING MESSAGE='企業が見つかりません'; END IF;
  RETURN coalesce((SELECT jsonb_agg(x) FROM (
    SELECT r.id,b.metadata->>'fileName' file_name,b.metadata->>'sheetName' sheet_name,b.metadata->>'provider' provider,b.metadata->>'providerName' provider_name,
      r.source_row,r.normalized,b.metadata->'headers' headers,r.raw_values,b.metadata->'fields' fields,r.created_at
    FROM public.company_profile_links l JOIN public.company_import_rows r ON r.org_id=l.org_id AND r.id=l.import_row_id
      JOIN public.company_import_batches b ON b.org_id=r.org_id AND b.id=r.batch_id
    WHERE l.org_id=o AND l.company_id=p_company_id ORDER BY r.created_at DESC,r.id LIMIT 50
  ) x),'[]');
END; $$;

REVOKE ALL ON FUNCTION public.crm_import_standard_fields(),public.crm_normalize_import_row(jsonb,jsonb),public.crm_preserve_import_on_item_delete(),public.crm_preserve_import_on_list_delete() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.company_import_config(),public.save_company_import_field(text,text,text,jsonb,boolean,integer),
  public.save_company_import_template(uuid,text,text,jsonb,boolean,integer),public.begin_company_import(uuid,uuid,jsonb,integer,text),
  public.get_company_import_job(uuid),public.append_company_import(uuid,jsonb),public.get_company_import_sources(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.company_import_config(),public.save_company_import_field(text,text,text,jsonb,boolean,integer),
  public.save_company_import_template(uuid,text,text,jsonb,boolean,integer),public.begin_company_import(uuid,uuid,jsonb,integer,text),
  public.get_company_import_job(uuid),public.append_company_import(uuid,jsonb),public.get_company_import_sources(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
