-- Synthetic acceptance fixtures. Requires a staff-admin JWT in request.jwt.claims.
-- Always execute inside BEGIN / ROLLBACK; no fixture is retained.
DO $test$
DECLARE
 o uuid:=public.crm_require_org(); token text:='統合検索検証'||replace(gen_random_uuid()::text,'-','');
 v_list uuid; v_batch uuid:=gen_random_uuid(); v_master bigint; v_master2 bigint; c uuid; c2 uuid; i uuid;
 v_record uuid; v_version int; meta jsonb; r jsonb; f jsonb; v_other uuid; v_other_org uuid;
BEGIN
 INSERT INTO public.call_lists(org_id,name) VALUES(o,token) RETURNING id INTO v_list;
 INSERT INTO public.company_master(company_name,representative,phone,full_address,prefecture,city,revenue_k,employee_count,representative_age,established_year,tsr_id,remarks,source_file)
 VALUES(token||'共通社','検証太郎','0311111111','東京都港区芝1-2-3','東京都','港区',100000,10,60,2000,token||'TSR',
  jsonb_build_object('代表者住所','東京都港区芝1-2-3')::text,token||'.csv') RETURNING id INTO v_master;
 SELECT l.company_id INTO STRICT c FROM public.company_profile_links l WHERE l.org_id=o AND l.master_id=v_master;
 f:=jsonb_build_object('keyword',token,'addressMatch','same','revenueMin','100000','establishedMin','2000','establishedMax','2000');
 r:=public.search_company_directory(f,0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'master / matching address / inclusive establishment: %',r->'count'; END IF;
 UPDATE public.company_master SET revenue_k=110000 WHERE id=v_master;
 IF (SELECT revenue_k FROM public.company_directory_search WHERE company_id=c)<>110000 THEN RAISE EXCEPTION 'financial-only update did not refresh'; END IF;
 meta:=jsonb_build_object('fileName',token||'-client.p.id.csv','sheetName','Customer','provider','client','providerName',token,
  'headers',jsonb_build_array('会社名','代表者','TEL','所在地','売上高（千円）','従業員数','顧客番号','業種細分類'),
  'mapping','[{"key":"company_name"},{"key":"representative"},{"key":"phone"},{"key":"address"},{"key":"revenue_k","unit":"千円","unitConfirmed":true},{"key":"employee_count"},{"key":"source_company_code"},{"key":"industry_sub"}]'::jsonb);
 r:=public.begin_company_import(v_batch,v_list,meta,2,repeat(md5(token),2));
 r:=public.append_company_import(v_batch,jsonb_build_array(
  jsonb_build_object('row_no',1,'source_row',4,'values',jsonb_build_array(token||'共通社','検証太郎','0311111111','東京都港区芝1-2-3','200000','10','00001234','検証業種')),
  jsonb_build_object('row_no',2,'source_row',5,'values',jsonb_build_array(token||'追加社','検証次郎','0311111112','〒277-0001 千葉県柏市1-2-3','','0','00005678','検証業種'))));
 IF (r->>'saved')::int<>2 OR (r->>'rejected')::int<>0 THEN RAISE EXCEPTION 'import failed: %',r; END IF;
 SELECT item_id INTO STRICT i FROM public.company_import_rows WHERE org_id=o AND batch_id=v_batch AND row_no=1;
 SELECT l.company_id INTO STRICT c2 FROM public.company_profile_links l JOIN public.company_import_rows ir ON ir.id=l.import_row_id WHERE ir.batch_id=v_batch AND ir.row_no=2;
 IF (SELECT company_id FROM public.company_profile_links WHERE item_id=i)<>c THEN RAISE EXCEPTION 'master and imported list did not share identity'; END IF;
 IF (SELECT count(*) FROM public.company_master WHERE company_name=token||'追加社')<>0 THEN RAISE EXCEPTION 'private import copied into global master'; END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'provider','client','sourceQuery',token,'addressMatch','same','revenueMin','150000'),0,50,true);
 IF (r->>'count')::int<>1 OR r#>>'{rows,0,id}'<>c::text THEN RAISE EXCEPTION 'combined source/financial/address filters'; END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'revenueNullMode','only','employeeMax','1','prefecture',jsonb_build_array('千葉県'),'saibunrui',jsonb_build_array('検証業種')),0,50,true);
 IF (r->>'count')::int<>1 OR r#>>'{rows,0,id}'<>c2::text THEN RAISE EXCEPTION 'missing revenue / zero employees / postcode prefecture / source classification'; END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'identifier','00005678'),0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'client code lost leading zeros'; END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'sourceQuery','p.id'),0,50,true);
 IF (r->>'count')::int<>2 OR jsonb_array_length(r->'rows')<>2 THEN RAISE EXCEPTION 'count optimization rewrote a search literal'; END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'addressMatch','unknown'),0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'unknown address treated as a match or difference'; END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'revenueMin','250000','revenueNullMode','include'),0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'range include-null semantics'; END IF;
 INSERT INTO public.company_master(company_name,representative,phone,source_file) VALUES(token||'未登録社','検証三郎','0311111113',token||'.csv') RETURNING id INTO v_master2;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'callStatus',jsonb_build_array('未登録')),0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'unregistered semantics'; END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'listIds',jsonb_build_array(v_list),'callStatus',jsonb_build_array('未登録')),0,50,true);
 IF (r->>'count')::int<>0 THEN RAISE EXCEPTION 'unregistered must not bypass selected list'; END IF;
 INSERT INTO public.call_records(org_id,list_id,item_id,round,status,called_at) VALUES(o,v_list,i,1,'不通','2026-09-12T03:00:00Z');
 INSERT INTO public.call_records(org_id,list_id,item_id,round,status,called_at) VALUES(o,v_list,i,2,'アポ獲得','2026-09-13T03:00:00Z') RETURNING id INTO v_record;
 f:=jsonb_build_object('keyword',token,'listIds',jsonb_build_array(v_list),'callStatus',jsonb_build_array('アポ獲得'),'callCountMin','2','callCountMax','3','lastCallFrom','2026-09-13','lastCallTo','2026-09-13');
 r:=public.search_company_directory(f,0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'call count / last date / latest status combination'; END IF;
 UPDATE public.call_records SET status='キーマン不在' WHERE id=v_record;
 r:=public.search_company_directory(f,0,50,true);
 IF (r->>'count')::int<>0 THEN RAISE EXCEPTION 'edited call history not reflected'; END IF;
 DELETE FROM public.call_records WHERE id=v_record;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'callStatus',jsonb_build_array('不通')),0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'deleted latest call not reflected'; END IF;
 r:=public.set_company_directory_label(c2,'M&Aニーズあり',true);
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'dbLabel',jsonb_build_array('M&Aニーズあり')),0,50,true);
 IF (r->>'count')::int<>1 OR r#>>'{rows,0,id}'<>c2::text THEN RAISE EXCEPTION 'new company label not searchable'; END IF;
 PERFORM public.set_company_directory_label(c2,'M&Aニーズあり',false);
 INSERT INTO public.company_db_labels(org_id,company_master_id,label) VALUES(o,v_master,'M&Aニーズあり');
 IF NOT (public.get_company_directory_values(c)->'labels' @> '["M&Aニーズあり"]') THEN RAISE EXCEPTION 'legacy label lost'; END IF;
 PERFORM public.set_company_directory_label(c,'M&Aニーズあり',false);
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'dbLabel',jsonb_build_array('M&Aニーズあり')),0,50,true);
 IF (r->>'count')::int<>0 THEN RAISE EXCEPTION 'legacy label override not reflected'; END IF;
 SELECT version INTO v_version FROM public.company_profiles WHERE id=c;
 PERFORM public.update_company_profile(c,v_version,jsonb_build_object('address','東京都新宿区西新宿1-2-3','next_action_at',now()-interval '1 day'));
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'addressMatch','different','scope','due','nextActionFrom',(now()-interval '2 days')::date::text,'nextActionTo',now()::date::text),0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'manual address / due / next date'; END IF;
 IF r#>>'{rows,0,city}' IS NOT NULL THEN RAISE EXCEPTION 'old city exported after address change'; END IF;
 SELECT version INTO v_version FROM public.company_profiles WHERE id=c;
 PERFORM public.update_company_profile(c,v_version,jsonb_build_object('representative','検証別人'));
 IF (SELECT representative_age FROM public.company_directory_search WHERE company_id=c) IS NOT NULL THEN RAISE EXCEPTION 'old CEO age leaked to new representative'; END IF;
 SELECT id INTO v_other_org FROM public.organizations WHERE id<>o LIMIT 1;
 IF v_other_org IS NULL THEN RAISE EXCEPTION 'organization-isolation test requires another organization'; END IF;
 INSERT INTO public.company_profiles(org_id,company_name,source_count) VALUES(v_other_org,token||'別組織社',1) RETURNING id INTO v_other;
 IF v_other IS NOT NULL THEN
  IF public.get_company_directory_values(v_other)<>'{}'::jsonb THEN RAISE EXCEPTION 'other organization values visible'; END IF;
  BEGIN PERFORM public.set_company_directory_label(v_other,'M&Aニーズあり',true); RAISE EXCEPTION 'other organization label writable';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'sortCol','company_name'),0,2,true);
 IF (r->>'count')::int<>3 OR jsonb_array_length(r->'rows')<>2 THEN RAISE EXCEPTION 'page/count mismatch'; END IF;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'sortCol','id'),2,1000,false);
 IF jsonb_array_length(r->'rows')<>1 OR r->'count'<>'null'::jsonb THEN RAISE EXCEPTION 'export pagination mismatch'; END IF;
 DELETE FROM public.call_lists WHERE id=v_list;
 r:=public.search_company_directory(jsonb_build_object('keyword',token,'identifier','00005678'),0,50,true);
 IF (r->>'count')::int<>1 THEN RAISE EXCEPTION 'list deletion removed imported company from DB'; END IF;
END $test$;
SELECT jsonb_build_object('result','passed','assertions',27,'fixtures','rollback only') acceptance;
