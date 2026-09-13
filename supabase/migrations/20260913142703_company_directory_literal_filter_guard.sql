-- Build count-compatible column references in the function, never rewrite user literals.
DO $patch$
DECLARE
 definition text:=pg_get_functiondef('public.search_company_directory(jsonb,integer,integer,boolean)'::regprocedure);
 needle text:=$needle$count_where:=replace(substring(w FROM length(base_where)+1),'p.id','d.company_id');$needle$;
BEGIN
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Expected count filter was not found'; END IF;
 definition:=replace(definition,'p.id IN (','d.company_id IN (');
 definition:=replace(definition,'l.company_id=p.id AND l.item_id','l.company_id=d.company_id AND l.item_id');
 definition:=replace(definition,needle,'count_where:=substring(w FROM length(base_where)+1);');
 EXECUTE definition;
END $patch$;
NOTIFY pgrst,'reload schema';
