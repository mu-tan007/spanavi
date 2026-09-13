-- A manually corrected company address must not export an old, unrelated city.
DO $patch$
DECLARE
 definition text:=pg_get_functiondef('public.search_company_directory(jsonb,integer,integer,boolean)'::regprocedure);
 needle text:=$needle$''prefecture'',d.prefecture,''crm_stage''$needle$;
 replacement text:=$replacement$''prefecture'',d.prefecture,''city'',CASE WHEN position(lower(normalize(d.values->>''city'',NFKC)) in lower(normalize(p.address,NFKC)))>0 THEN d.values->>''city'' END,''crm_stage''$replacement$;
BEGIN
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Expected directory location projection was not found'; END IF;
 EXECUTE replace(definition,needle,replacement);
END $patch$;
ALTER FUNCTION public.classify_shareholder_type(text) SET search_path=public,pg_temp;
NOTIFY pgrst,'reload schema';
