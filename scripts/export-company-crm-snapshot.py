"""Read-only, repeatable snapshot for the organization-scoped CRM backfill.

DATABASE_URL is supplied by the operator; no credentials or source rows are logged.
"""
import json
import os
import pathlib
import sys
import time
import psycopg2

destination = pathlib.Path(sys.argv[1])
org_id = sys.argv[2]
destination.mkdir(parents=True, exist_ok=True)
conn = psycopg2.connect(os.environ['DATABASE_URL'], connect_timeout=15)
conn.set_session(readonly=True, isolation_level='REPEATABLE READ')
queries = {
    'company_master': ("""select id, company_name, representative, phone, full_address, address,
        prefecture, city, tsr_id, remarks, source_file, business_description, industry_major,
        industry_sub from public.company_master order by id""", ()),
    'call_list_items': ("""select i.id,i.company,i.representative,i.phone,i.address,i.memo,i.list_id,
        i.no,i.business,l.name list_name,l.is_archived from public.call_list_items i
        join public.call_lists l on l.id=i.list_id and l.org_id=i.org_id
        where i.org_id=%s order by i.id""", (org_id,)),
}
stats = {'org_id': org_id, 'snapshot_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
for table, (sql, params) in queries.items():
    cursor = conn.cursor(name='crm_' + table)
    cursor.itersize = 5000
    cursor.execute(sql, params)
    # Named cursors populate description on the first fetch.
    count = 0
    with (destination / (table + '.jsonl')).open('w', encoding='utf-8') as out:
        for values in cursor:
            row = dict(zip((c.name for c in cursor.description), values))
            out.write(json.dumps(row, ensure_ascii=False, default=str) + '\n')
            count += 1
    cursor.close()
    stats[table] = count
    print(json.dumps({'table': table, 'rows': count}), flush=True)
conn.rollback()
conn.close()
(destination / 'snapshot.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
