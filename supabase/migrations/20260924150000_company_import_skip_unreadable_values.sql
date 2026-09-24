-- 数値・日付・電話として読めない値（「該当しない」「2億9899万円(推定)」等）で行ごと落とさない。
-- その項目だけ空欄にし、元の値は raw_values に出典として残る。src/utils/companyImportFields.js と同じ判定。
CREATE OR REPLACE FUNCTION public.crm_normalize_import_row(p_values jsonb,p_metadata jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb:='{}'; col record; f jsonb; v text; n numeric; factor numeric; k text; address text; pref text; city text; jp text[];
BEGIN
  FOR col IN SELECT value,ordinality FROM jsonb_array_elements(p_metadata->'mapping') WITH ORDINALITY LOOP
    k:=col.value->>'key'; IF coalesce(k,'')='' THEN CONTINUE; END IF;
    v:=trim(coalesce(p_values->>(col.ordinality::integer-1),'')); IF v='' THEN CONTINUE; END IF;
    IF normalize(v,NFKC) ~* '^((該当(し|する情報|情報)?|情報)?な[しい]|無し|不明|非公開|未公開|n/?a|[-－ー―—‐]+)$' THEN CONTINUE; END IF;
    SELECT value INTO f FROM jsonb_array_elements(p_metadata->'fields') WHERE value->>'key'=k;
    IF f->>'type'='number' THEN
      v:=regexp_replace(regexp_replace(replace(normalize(v,NFKC),',',''),'\s+','','g'),'\([^()]*\)$','');
      n:=NULL;
      IF (f->>'money')::boolean IS TRUE THEN
        jp:=regexp_match(v,'^(?:([0-9]+(?:\.[0-9]+)?)億)?(?:([0-9]+(?:\.[0-9]+)?)万)?([0-9]+)?円?$');
        IF jp IS NOT NULL AND (jp[1] IS NOT NULL OR jp[2] IS NOT NULL) THEN
          n:=(coalesce(jp[1]::numeric,0)*100000000+coalesce(jp[2]::numeric,0)*10000+coalesce(jp[3]::numeric,0))/1000;
        END IF;
      END IF;
      IF n IS NULL THEN
        v:=regexp_replace(v,CASE WHEN (f->>'money')::boolean IS TRUE THEN '円$' ELSE '[名人]$' END,'');
        IF v !~ '^-?[0-9]+(\.[0-9]+)?$' THEN CONTINUE; END IF;
        factor:=CASE WHEN (f->>'money')::boolean IS TRUE THEN CASE col.value->>'unit' WHEN '円' THEN .001 WHEN '万円' THEN 10 WHEN '百万円' THEN 1000 WHEN '億円' THEN 100000 ELSE 1 END ELSE 1 END;
        n:=v::numeric*factor;
      END IF;
      IF abs(n)>1e14 THEN CONTINUE; END IF;
      result:=result||jsonb_build_object(k,n);
    ELSIF f->>'type'='date' THEN
      v:=replace(normalize(v,NFKC),'/','-');
      IF v !~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' THEN CONTINUE; END IF;
      BEGIN result:=result||jsonb_build_object(k,(v::date)::text); EXCEPTION WHEN others THEN NULL; END;
    ELSE
      IF k='phone' THEN
        v:=normalize(v,NFKC);
        IF v !~ '^[+0-9\s()\-‐‑‒–—―−ー]+$' THEN CONTINUE; END IF;
        IF v LIKE '+81%' THEN v:='0'||regexp_replace(substring(regexp_replace(v,'[^0-9]','','g') FROM 3),'^0','');
        ELSE v:=regexp_replace(v,'[^0-9]','','g'); IF v ~ '^[1-9][0-9]{8,9}$' THEN v:='0'||v; END IF; END IF;
        IF v !~ '^0[0-9]{9,10}$' THEN CONTINUE; END IF;
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
REVOKE ALL ON FUNCTION public.crm_normalize_import_row(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
