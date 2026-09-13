-- Production acceptance fixtures. Every write, including list totals and CRM
-- facts, rolls back. Run as a maintenance connection; no phone calls are made.
BEGIN;
SET LOCAL statement_timeout='30s';
SELECT set_config('request.jwt.claims','{"sub":"1d0c2efc-97ea-4df5-b614-7db647b15a92","role":"authenticated"}',true);
DO $verify$
<<acceptance>>
DECLARE o uuid:=public.crm_require_org(); lid uuid:=gen_random_uuid(); jid uuid:=gen_random_uuid(); j2 uuid:=gen_random_uuid();
  other_org uuid; other_company uuid; company_id uuid; source_item uuid; other_item uuid; source_id uuid;
  title text:='株式会社SPANAVI_IMPORT_VERIFY_'||replace(gen_random_uuid()::text,'-',''); code text;
  meta jsonb; m2 jsonb; job jsonb; result jsonb; config jsonb; t jsonb; custom jsonb; rows jsonb; rejected boolean;
BEGIN
  SELECT id INTO other_org FROM public.organizations WHERE id<>o ORDER BY id LIMIT 1;
  INSERT INTO public.company_profiles(org_id,company_name) VALUES(other_org,title||'_other_org') RETURNING id INTO other_company;
  INSERT INTO public.company_import_fields(org_id,key,label,type) VALUES(other_org,'custom_other_verify','他組織の項目','text');
  INSERT INTO public.call_lists(id,org_id,name) VALUES(lid,o,'SPANAVI_IMPORT_VERIFY_ROLLBACK');
  SELECT x INTO code FROM (SELECT d::text||'987654321098' x FROM generate_series(1,9) d) v WHERE public.crm_corporate_number(x) IS NOT NULL LIMIT 1;
  SET LOCAL ROLE authenticated;
  config:=public.company_import_config();
  IF jsonb_array_length(config->'fields')<27 OR (config->>'can_manage')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL config'; END IF;
  IF EXISTS(SELECT 1 FROM public.company_profiles WHERE id=other_company) THEN RAISE EXCEPTION 'FAIL organization isolation'; END IF;
  IF EXISTS(SELECT 1 FROM public.company_import_fields WHERE org_id=other_org) THEN RAISE EXCEPTION 'FAIL import field isolation'; END IF;
  rejected:=false; BEGIN PERFORM public.get_company_import_sources(other_company); EXCEPTION WHEN no_data_found THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL cross-org sources'; END IF;
  rejected:=false; BEGIN PERFORM public.crm_sync_source(o,NULL,NULL); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL internal function grants'; END IF;

  custom:=public.save_company_import_field('custom_verify_import','確認ランク','text','["元ランク"]',true,0);
  IF custom->>'label'<>'確認ランク' THEN RAISE EXCEPTION 'FAIL custom field'; END IF;
  rejected:=false; BEGIN PERFORM public.save_company_import_field('custom_verify_import','競合','text','[]',true,0); EXCEPTION WHEN serialization_failure THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL field concurrent edit'; END IF;
  meta:=jsonb_build_object('provider','tdb','providerName','検証用','fileName','SPANAVI_IMPORT_VERIFY.csv','sheetName','企業',
    'headers','["企業名","代表者","電話番号","会社住所","代表者現住所","企業コード","売上高","資本金","元ランク","法人番号","未対応列"]'::jsonb,
    'mapping','[{"key":"company_name"},{"key":"representative"},{"key":"phone"},{"key":"address"},{"key":"representative_address"},{"key":"tdb_code"},{"key":"revenue_k","unit":"百万円","unitConfirmed":true},{"key":"capital_k","unit":"万円","unitConfirmed":true},{"key":"custom_verify_import"},{"key":"corporate_number"},{"key":""}]'::jsonb);
  t:=public.save_company_import_template(gen_random_uuid(),'tdb','SPANAVI_IMPORT_VERIFY',jsonb_build_object('columns',jsonb_build_array(jsonb_build_object('header','売上高','occurrence',0,'rule',jsonb_build_object('key','revenue_k','unit','百万円','unitConfirmed',true)))) ,true,0);
  t:=public.save_company_import_template((t->>'id')::uuid,'tdb','SPANAVI_IMPORT_VERIFY',t->'settings',false,1);
  IF (t->>'version')::integer<>2 OR (t->>'active')::boolean THEN RAISE EXCEPTION 'FAIL template update'; END IF;
  m2:=jsonb_set(meta,'{mapping,6,unitConfirmed}','false');
  rejected:=false; BEGIN PERFORM public.begin_company_import(gen_random_uuid(),lid,m2,1,repeat('e',64)); EXCEPTION WHEN invalid_parameter_value THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL unconfirmed units'; END IF;
  meta:=jsonb_set(jsonb_set(meta,'{headers}',(meta->'headers')||'["当期純利益(千円)","従業員数"]'),'{mapping}',(meta->'mapping')||'[{"key":"net_income_k","unit":"千円","unitConfirmed":true},{"key":"employee_count"}]');
  job:=public.begin_company_import(jid,lid,meta,3,repeat('a',64));
  IF (job->>'id')::uuid<>jid THEN RAISE EXCEPTION 'FAIL begin import'; END IF;
  rows:=jsonb_build_array(
    jsonb_build_object('row_no',1,'source_row',7,'values',jsonb_build_array(title,'検証 太郎','３１２３４５６７８','東京都港区三田1-2-3','東京都港区三田１丁目２番３号','000001','12','30','A',code,'原文のまま','12.75','3.5')),
    jsonb_build_object('row_no',2,'source_row',10,'values',jsonb_build_array(title,'別会社 太郎','0667890123','大阪府大阪市北区1-2-3','','000002','15','40','B','','同名の別会社')),
    jsonb_build_object('row_no',3,'source_row',11,'values',jsonb_build_array('','検証 太郎','0312345678','','','','','','','','企業名なし')));
  result:=public.append_company_import(jid,rows);
  IF (result->>'saved')::integer<>2 OR (result->>'rejected')::integer<>1 THEN RAISE EXCEPTION 'FAIL import rows: %',public.get_company_import_job(jid)->'errors'; END IF;
  SELECT item_id,id INTO source_item,source_id FROM public.company_import_rows WHERE batch_id=jid AND row_no=1;
  SELECT l.company_id INTO company_id FROM public.company_profile_links l WHERE l.item_id=source_item;
  IF company_id IS NULL THEN RAISE EXCEPTION 'FAIL automatic company DB registration'; END IF;
  IF (SELECT normalized->>'revenue_k' FROM public.company_import_rows WHERE id=source_id)<>'12000' THEN RAISE EXCEPTION 'FAIL TDB revenue unit'; END IF;
  IF (SELECT normalized->>'capital_k' FROM public.company_import_rows WHERE id=source_id)<>'300' THEN RAISE EXCEPTION 'FAIL TDB capital unit'; END IF;
  IF (SELECT phone FROM public.call_list_items WHERE id=source_item)<>'0312345678' THEN RAISE EXCEPTION 'FAIL phone normalization'; END IF;
  IF (SELECT employees FROM public.call_list_items WHERE id=source_item)<>'3.5' THEN RAISE EXCEPTION 'FAIL fractional employees'; END IF;
  IF (SELECT normalized->>'net_income_k' FROM public.company_import_rows WHERE id=source_id)<>'12.75' OR (SELECT net_income FROM public.call_list_items WHERE id=source_item)<>12 THEN RAISE EXCEPTION 'FAIL precise profit provenance and legacy conversion'; END IF;
  IF (SELECT address_match FROM public.company_profile_links WHERE item_id=source_item)<>'same' THEN RAISE EXCEPTION 'FAIL home address comparison'; END IF;
  IF (SELECT count(DISTINCT l.company_id) FROM public.company_profile_links l JOIN public.company_import_rows r ON r.id=l.import_row_id WHERE r.batch_id=jid)<>2 THEN RAISE EXCEPTION 'FAIL same-name separation'; END IF;
  result:=public.get_company_import_sources(company_id);
  IF result->0->'normalized'->>'custom_verify_import'<>'A' OR result->0->'raw_values'->>10<>'原文のまま' OR (result->0->>'source_row')::integer<>7 THEN RAISE EXCEPTION 'FAIL provenance and custom field'; END IF;
  result:=public.append_company_import(jid,rows);
  IF (result->>'saved')::integer<>2 OR (SELECT count(*) FROM public.call_list_items WHERE list_id=lid)<>2 THEN RAISE EXCEPTION 'FAIL retry idempotency'; END IF;
  result:=public.begin_company_import(gen_random_uuid(),lid,meta,3,repeat('a',64));
  IF (result->>'id')::uuid<>jid OR (result->>'processed')::integer<>3 THEN RAISE EXCEPTION 'FAIL resume fingerprint'; END IF;
  rejected:=false; BEGIN PERFORM public.append_company_import(jid,jsonb_set(rows,'{0,values,0}','"改変"')); EXCEPTION WHEN invalid_parameter_value THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL immutable source'; END IF;

  -- Import the identical entity through the company DB entry point, with another
  -- source code and amount. It must reuse the same CRM ID and retain both facts.
  m2:=jsonb_set(jsonb_set(jsonb_set(meta,'{provider}','"tsr"'),'{mapping,5,key}','"tsr_code"'),'{mapping,6,unit}','"千円"');
  result:=public.begin_company_import(j2,NULL,m2,1,repeat('b',64));
  result:=public.append_company_import(j2,jsonb_build_array(jsonb_build_object('row_no',1,'source_row',3,'values',rows->0->'values')));
  IF (result->>'saved')::integer<>1 THEN RAISE EXCEPTION 'FAIL direct company DB import: %',public.get_company_import_job(j2)->'errors'; END IF;
  IF (SELECT l.company_id FROM public.company_profile_links l JOIN public.company_import_rows r ON r.id=l.import_row_id WHERE r.batch_id=j2)<>company_id THEN RAISE EXCEPTION 'FAIL common CRM identity'; END IF;
  IF jsonb_array_length(public.get_company_import_sources(company_id))<>2 THEN RAISE EXCEPTION 'FAIL multiple source preservation'; END IF;
  result:=public.get_company_profile(company_id);
  result:=public.update_company_profile(company_id,(result->'profile'->>'version')::integer,'{"shared_memo":"SPANAVI_IMPORT_VERIFY_OVERRIDE"}');
  RESET ROLE;
  UPDATE public.call_list_items SET business='更新の検証',representative='変更後の代表者' WHERE id=source_item;
  IF (SELECT shared_memo FROM public.company_profiles WHERE id=company_id)<>'SPANAVI_IMPORT_VERIFY_OVERRIDE' THEN RAISE EXCEPTION 'FAIL manual field preservation'; END IF;
  IF (SELECT address_match FROM public.company_profile_links WHERE item_id=source_item)<>'unknown' THEN RAISE EXCEPTION 'FAIL previous CEO home reused'; END IF;
  -- List clear and list deletion must leave imported companies in the company DB.
  DELETE FROM public.call_list_items WHERE id=source_item;
  IF NOT EXISTS(SELECT 1 FROM public.company_profile_links l WHERE l.import_row_id=source_id AND l.item_id IS NULL AND l.company_id=acceptance.company_id) THEN RAISE EXCEPTION 'FAIL retention after row delete'; END IF;
  SELECT item_id INTO other_item FROM public.company_import_rows WHERE batch_id=jid AND row_no=2;
  DELETE FROM public.call_lists WHERE id=lid;
  IF EXISTS(SELECT 1 FROM public.call_list_items WHERE id=other_item) OR (SELECT count(*) FROM public.company_profile_links l JOIN public.company_import_rows r ON r.id=l.import_row_id WHERE r.batch_id=jid)<>2 THEN RAISE EXCEPTION 'FAIL retention after list delete'; END IF;
  SET LOCAL ROLE anon;
  rejected:=false; BEGIN PERFORM public.company_import_config(); EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL anonymous access'; END IF;
  RESET ROLE;
END;
$verify$;
ROLLBACK;
SELECT 'Import verification passed; all fixture writes rolled back' AS result,
  (SELECT count(*) FROM public.company_import_batches WHERE metadata->>'fileName'='SPANAVI_IMPORT_VERIFY.csv') remaining_test_imports,
  (SELECT count(*) FROM public.call_lists WHERE name='SPANAVI_IMPORT_VERIFY_ROLLBACK') remaining_test_lists;
