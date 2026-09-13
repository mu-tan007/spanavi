"""Verify the initialized CRM with read-only checks and ROLLED-BACK fixtures.

DATABASE_URL is operator-provided. No real calls, messages, or committed test data.
Usage: python verify-company-crm.py SNAPSHOT_DIR ORG_ID AUTH_USER_ID CALL_LIST_ID
"""
import json
import os
import pathlib
import sys
import time
import uuid
import psycopg2

directory, org, user, list_id = sys.argv[1:5]
expected = json.loads((pathlib.Path(directory)/'company-crm-seed-summary.json').read_text(encoding='utf-8'))
connection = psycopg2.connect(os.environ['DATABASE_URL'], connect_timeout=15, options='-c statement_timeout=90000 -c lock_timeout=10000')
cur = connection.cursor()
report = {'checks': [], 'timings_ms': {}}

def query(sql, values=()):
    cur.execute(sql, values)
    return cur.fetchone()[0] if cur.description else None

def check(name, predicate):
    assert predicate, name
    report['checks'].append(name)

def claims(uid=user):
    query("SELECT set_config('request.jwt.claims',%s,true)", (json.dumps({'sub': uid, 'role': 'authenticated'}),))

def as_staff():
    claims()
    cur.execute('SET LOCAL ROLE authenticated')

def denied(name, statement, args=(), role='authenticated', uid=user):
    claims(uid)
    cur.execute('SET LOCAL ROLE '+role)
    cur.execute('SAVEPOINT rejected_action')
    try:
        cur.execute(statement, args)
    except psycopg2.Error as error:
        code=error.pgcode
        cur.execute('ROLLBACK TO SAVEPOINT rejected_action')
        check(name, code in ('42501','P0002'))
    else:
        raise AssertionError(name+' was not rejected')
    finally:
        cur.execute('RESET ROLE')

try:
    check('initialized_profile_count', query('SELECT count(*) FROM public.company_profiles')==expected['uniqueCompanies'])
    check('initialized_source_count', query('SELECT count(*) FROM public.company_profile_links')==expected['totalSources'])
    check('initialized_fact_count', query('SELECT count(*) FROM public.company_profile_facts')==expected['facts'])
    denied('anonymous_read_denied','SELECT public.company_profile_stats()',role='anon')
    denied('memberless_read_denied','SELECT public.company_profile_stats()',uid=str(uuid.uuid4()))
    denied('direct_shared_update_denied',"UPDATE public.company_profiles SET shared_memo='unauthorized' WHERE org_id=%s",(org,))
    other_org=query('SELECT id FROM public.organizations WHERE id<>%s ORDER BY id LIMIT 1',(org,))
    foreign_profile=query("INSERT INTO public.company_profiles(org_id,company_name) VALUES(%s,'CRM権限テスト') RETURNING id",(other_org,))
    denied('cross_org_profile_denied','SELECT public.get_company_profile(%s)',(foreign_profile,))
    denied('internal_sync_denied','SELECT public.crm_sync_source(%s,NULL,NULL)',(org,))
    as_staff()
    check('cross_org_table_hidden',query('SELECT count(*) FROM public.company_profiles WHERE id=%s',(foreign_profile,))==0)
    start=time.monotonic()
    stats=query('SELECT public.company_profile_stats()')
    report['timings_ms']['stats']=round((time.monotonic()-start)*1000)
    check('organization_company_count',stats['total']==expected['uniqueCompanies'])
    report['stats']=stats
    start=time.monotonic()
    summary=query('SELECT public.call_list_filter_summary(%s)',(list_id,))
    report['timings_ms']['list_summary']=round((time.monotonic()-start)*1000)
    check('shared_address_counts',all(summary['address_match'][k]==expected['lists'][list_id][k] for k in ['same','different','unknown']))
    start=time.monotonic()
    first=query("SELECT public.call_list_filtered_data(%s,'same',NULL,NULL,0,1000,true)",(list_id,))
    report['timings_ms']['same_first_page']=round((time.monotonic()-start)*1000)
    check('same_filter_count',first['count']==expected['lists'][list_id]['same'])
    check('shared_results_not_dropped',len(first['items'])==1000 and all(i['company_id'] and i['shared_address_match']=='same' for i in first['items']))
    check('page_histories_are_scoped',all(r['item_id'] in {i['id'] for i in first['items']} and r['list_id']==list_id and r['org_id']==org for r in first['records']))
    second=query("SELECT public.call_list_filtered_data(%s,'same',NULL,NULL,1000,1000,false)",(list_id,))
    check('pages_do_not_overlap',not ({i['id'] for i in first['items']} & {i['id'] for i in second['items']}))
    sample=first['items'][0]
    details=query('SELECT public.get_company_profile(NULL,NULL,%s)',(sample['id'],))
    profile=details['profile']
    check('home_source_present',profile['home_source'].get('label') and profile['representative_address'])
    master_id=next(s['master_id'] for s in details['sources'] if s['master_id'])
    same=query('SELECT public.get_company_profile(NULL,%s)',(master_id,))
    check('master_and_list_share_identity',same['profile']['id']==profile['id'])
    saved=query('SELECT public.update_company_profile(%s,%s,%s)',(profile['id'],profile['version'],json.dumps({'shared_memo':'CRM_ROLLBACK_TEST','crm_stage':'再連絡予定'})))
    same=query('SELECT public.get_company_profile(NULL,%s)',(master_id,))
    check('shared_edits_visible_from_master',same['profile']['shared_memo']=='CRM_ROLLBACK_TEST')
    check('version_and_audit',saved['profile']['version']>profile['version'] and saved['events'][0]['event_type']=='shared_updated')
    cur.execute('SAVEPOINT stale_edit')
    try: query('SELECT public.update_company_profile(%s,%s,%s)',(profile['id'],profile['version'],'{"shared_memo":"stale"}'))
    except psycopg2.Error as error:
        code=error.pgcode;cur.execute('ROLLBACK TO SAVEPOINT stale_edit');check('stale_edit_rejected',code=='40001')
    else: raise AssertionError('stale edit accepted')
    # Roll back all edits before independent import/trigger fixtures.
    connection.rollback()
    claims()
    query('INSERT INTO public.company_profile_sync_orgs(org_id,enabled) VALUES(%s,true) ON CONFLICT(org_id) DO UPDATE SET enabled=true',(org,))
    suffix=uuid.uuid4().hex[:12]
    name='株式会社CRM検証'+suffix
    base={'company_name':name,'representative':'確認 太郎','phone':'0300001234','address':'東京都千代田区丸の内1-2-3',
          'full_address':'東京都千代田区丸の内1-2-3','representative_address':'〒100-0005_東京都千代田区丸の内１丁目２番３号','source_file':'ROLLBACK_ONLY'}
    as_staff()
    imported=query('SELECT public.import_company_master_batch(%s,%s)',(json.dumps([base]),'[]'))
    check('new_master_imported',imported['inserted']==1)
    again=query('SELECT public.import_company_master_batch(%s,%s)',(json.dumps([base]),'[]'))
    check('repeat_import_not_duplicated',again['inserted']==0 and again['updated']==1)
    cur.execute('RESET ROLE')
    master=query('SELECT id FROM public.company_master WHERE company_name=%s',(name,))
    item=query('INSERT INTO public.call_list_items(org_id,list_id,no,company,representative,phone,address,memo) VALUES(%s,%s,999999,%s,%s,%s,%s,\'{}\') RETURNING id',
               (org,list_id,name,base['representative'],base['phone'],base['address']))
    identity=query('SELECT company_id FROM public.company_profile_links WHERE item_id=%s',(item,))
    master_identity=query('SELECT company_id FROM public.company_profile_links WHERE org_id=%s AND master_id=%s',(org,master))
    check('new_call_import_links_automatically',identity==master_identity)
    check('new_call_uses_shared_home',query('SELECT address_match FROM public.company_profile_links WHERE item_id=%s',(item,))=='same')
    as_staff()
    detail=query('SELECT public.get_company_profile(%s)',(identity,))
    query('SELECT public.update_company_profile(%s,%s,%s)',(identity,detail['profile']['version'],json.dumps({'representative_address':'東京都千代田区丸の内1-2-4'})))
    check('shared_address_edit_updates_filter',query('SELECT address_match FROM public.company_profile_links WHERE item_id=%s',(item,))=='different')
    cur.execute('RESET ROLE')
    query('UPDATE public.call_list_items SET memo=%s WHERE id=%s',(json.dumps({'_note':'元リスト側のメモ更新'}),item))
    check('source_update_preserves_shared_override',query('SELECT representative_address FROM public.company_profiles WHERE id=%s',(identity,))=='東京都千代田区丸の内1-2-4')
    query('DELETE FROM public.call_list_items WHERE id=%s',(item,))
    check('source_deletion_updates_counts',query('SELECT list_count FROM public.company_profiles WHERE id=%s',(identity,))==0)
    connection.rollback()
    # Exercise an explicit merge without committing any original/company change.
    claims()
    query('INSERT INTO public.company_profile_sync_orgs(org_id,enabled) VALUES(%s,true) ON CONFLICT(org_id) DO UPDATE SET enabled=true',(org,))
    originals=[]; profiles=[]
    for label in ['A','B']:
        mid=query('INSERT INTO public.company_master(company_name,representative) VALUES(%s,%s) RETURNING id',
                  ('CRM統合確認'+suffix+label,'統合 太郎'))
        originals.append(mid)
        profiles.append(query('SELECT company_id FROM public.company_profile_links WHERE org_id=%s AND master_id=%s',(org,mid)))
    review=query('INSERT INTO public.company_profile_reviews(org_id,reason,company_ids,source_count) VALUES(%s,%s,%s,2) RETURNING id',
                 (org,'ROLLBACK_ONLY',json.dumps(profiles)))
    as_staff()
    donor=query('SELECT public.get_company_profile(%s)',(profiles[1],))
    query('SELECT public.update_company_profile(%s,%s,%s)',(profiles[1],donor['profile']['version'],json.dumps({'representative_address':'東京都千代田区丸の内1-2-3'})))
    # Conflicting source numbers must block merging even when the profile's
    # summary number is NULL because the disagreement is unresolved.
    cur.execute('RESET ROLE')
    cur.execute('SAVEPOINT corporate_conflict')
    cur.execute('SELECT DISTINCT corporate_number FROM public.company_profiles WHERE corporate_number IS NOT NULL LIMIT 2')
    numbers=[r[0] for r in cur.fetchall()]
    for i,number in enumerate(numbers):
        query("INSERT INTO public.company_profile_facts(org_id,company_id,source_key,field,value,normalized_value,source) VALUES(%s,%s,%s,'corporate_number',%s,%s,'{}')",
              (org,profiles[0],'ROLLBACK_ONLY:'+str(i),number,number))
    query('SELECT public.crm_refresh_company(%s)',(profiles[0],))
    check('conflicted_number_is_not_presented_as_confirmed',query('SELECT corporate_number IS NULL FROM public.company_profiles WHERE id=%s',(profiles[0],)))
    as_staff()
    try:
        query('SELECT public.merge_company_profile_review(%s,%s,%s)',(review,profiles[0],'競合番号の確認テスト'))
    except psycopg2.Error as error:
        code=error.pgcode;cur.execute('ROLLBACK TO SAVEPOINT corporate_conflict');check('conflicting_corporate_evidence_blocks_merge',code=='22023')
    else: raise AssertionError('conflicting corporate evidence was merged')
    as_staff()
    merged=query('SELECT public.merge_company_profile_review(%s,%s,%s)',(review,profiles[0],'同一企業の確認テスト'))
    check('manual_merge_keeps_both_sources',merged['profile']['master_count']==2)
    check('manual_merge_keeps_home_provenance',merged['profile']['home_state']=='available' and merged['profile']['home_source']['kind']=='manual')
    redirected=query('SELECT public.get_company_profile(%s)',(profiles[1],))
    check('merged_profile_redirects',redirected['profile']['id']==profiles[0])
    check('merged_master_uses_same_profile',query('SELECT public.get_company_profile(NULL,%s)',(originals[1],))['profile']['id']==profiles[0])
    check('manual_merge_is_audited',any(e['event_type']=='company_merged' for e in merged['events']))
    cur.execute('RESET ROLE')
    check('merge_preserves_original_records',query('SELECT count(*) FROM public.company_master WHERE id=ANY(%s)',(originals,))==2)
    connection.rollback()
    report['all_rolled_back']=True
finally:
    connection.rollback();connection.close()
pathlib.Path(directory,'company-crm-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True,indent=2))
