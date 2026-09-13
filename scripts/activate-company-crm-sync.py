"""Enable initialized CRM synchronization and catch up changes since its snapshot.

Uses DATABASE_URL, logs counts only. --apply commits the sync flag and refreshes
changed sources in small transactions; otherwise the comparison is read-only.
"""
import argparse
import hashlib
import json
import os
import pathlib
import time
import psycopg2

parser = argparse.ArgumentParser()
parser.add_argument('snapshot_dir', type=pathlib.Path)
parser.add_argument('org_id')
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
conn = psycopg2.connect(os.environ['DATABASE_URL'], connect_timeout=15,
                        options='-c statement_timeout=90000 -c lock_timeout=10000')
queries = {
    'company_master': """SELECT m.id,md5(coalesce(m.remarks,'')),l.id IS NULL OR
      ROW(m.company_name,coalesce(m.representative,''),coalesce(m.phone,''),
        coalesce(nullif(m.full_address,''),coalesce(m.prefecture,'')||coalesce(m.address,'')),
        coalesce(m.business_description,''),coalesce(nullif(m.industry_sub,''),m.industry_major,''))
      IS DISTINCT FROM ROW(l.source_data->>'company_name',l.source_data->>'representative',
        l.source_data->>'phone',l.source_data->>'address',l.source_data->>'business',l.source_data->>'industry')
      FROM public.company_master m LEFT JOIN public.company_profile_links l ON l.master_id=m.id AND l.org_id=%s""",
    'call_list_items': """SELECT i.id,md5(coalesce(i.memo,'')),l.id IS NULL OR
      ROW(coalesce(i.company,''),coalesce(i.representative,''),coalesce(i.phone,''),coalesce(i.address,''),coalesce(i.business,''),i.list_id,i.no)
      IS DISTINCT FROM ROW(l.source_data->>'company_name',l.source_data->>'representative',l.source_data->>'phone',
        l.source_data->>'address',l.source_data->>'business',l.list_id,l.sort_no)
      FROM public.call_list_items i LEFT JOIN public.company_profile_links l ON l.item_id=i.id AND l.org_id=i.org_id
      WHERE i.org_id=%s""",
}
report = {'applied': args.apply, 'sources': {}}
try:
    with conn.cursor() as cur:
        cur.execute('SELECT count(*) FROM public.company_profiles WHERE org_id=%s', (args.org_id,))
        if cur.fetchone()[0] == 0:
            raise RuntimeError('Load and verify the company seed before enabling synchronization')
        if args.apply:
            cur.execute('INSERT INTO public.company_profile_sync_orgs(org_id,enabled) VALUES(%s,true) '
                        'ON CONFLICT(org_id) DO UPDATE SET enabled=true', (args.org_id,))
    conn.commit()
    for table, sql in queries.items():
        memo_field = 'remarks' if table == 'company_master' else 'memo'
        previous = {}
        with (args.snapshot_dir / (table + '.jsonl')).open(encoding='utf-8') as source:
            for line in source:
                row = json.loads(line)
                previous[str(row['id'])] = hashlib.md5((row.get(memo_field) or '').encode()).hexdigest()
        changed = []
        seen = set()
        with conn.cursor(name='crm_catchup') as cur:
            cur.itersize = 10000
            cur.execute(sql, (args.org_id,))
            for record_id, memo_hash, basic_changed in cur:
                seen.add(str(record_id))
                if basic_changed or previous.get(str(record_id)) != memo_hash:
                    changed.append(record_id)
        conn.rollback()
        report['sources'][table] = {'current': len(seen), 'changed': len(changed),
                                     'deleted_since_snapshot': len(previous.keys() - seen)}
        print(json.dumps({table: report['sources'][table]}), flush=True)
        if args.apply:
            for offset in range(0, len(changed), 25):
                with conn.cursor() as cur:
                    for record_id in changed[offset:offset + 25]:
                        # Lock the original before reading its current values, as its
                        # normal update trigger does, so a concurrent edit cannot race.
                        cur.execute('SELECT id FROM public.' + table + ' WHERE id=%s FOR UPDATE', (record_id,))
                        if not cur.fetchone():
                            continue
                        cur.execute('SELECT public.crm_sync_source(%s,%s,%s)',
                                    (args.org_id, record_id if table == 'company_master' else None,
                                     record_id if table == 'call_list_items' else None))
                conn.commit()
                time.sleep(0.05)
    (args.snapshot_dir / 'company-crm-sync-activation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
finally:
    conn.rollback()
    conn.close()
