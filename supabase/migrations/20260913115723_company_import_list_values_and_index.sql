-- Cover organization-scoped source queries and preserve fractional employee
-- counts. The legacy list profit column is integer thousands; keep its existing
-- floor conversion while retaining the precise imported value in source facts.
SET LOCAL lock_timeout='5s';
CREATE INDEX company_import_rows_org_batch ON public.company_import_rows(org_id,batch_id,row_no);

CREATE OR REPLACE FUNCTION public.append_company_import(p_id uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
          (v->>'revenue_k')::numeric,floor((v->>'net_income_k')::numeric),v->>'employee_count',nullif(v->>'url',''),
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


NOTIFY pgrst,'reload schema';
