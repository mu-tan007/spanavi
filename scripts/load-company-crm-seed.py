"""Load a reviewed seed into EMPTY CRM tables, never into original source tables.

Usage: DATABASE_URL=... python scripts/load-company-crm-seed.py SNAPSHOT_DIR
The load commits in bounded batches while source synchronization stays disabled.
No credentials or source values logged. Resume is explicit and uses row counts.
"""
import json
import csv
import io
import os
import pathlib
import sys
import time
import psycopg2
from psycopg2 import sql

# The operator reads current provisioned capacity before choosing a budget.
budget_index = sys.argv.index('--max-db-wal-gib') if '--max-db-wal-gib' in sys.argv else None
budget_gib = float(sys.argv[budget_index + 1]) if budget_index is not None else 6

directory = pathlib.Path(sys.argv[1])
columns = json.loads((directory / 'seed-columns.json').read_text(encoding='utf-8'))
summary = json.loads((directory / 'company-crm-seed-summary.json').read_text(encoding='utf-8'))
allowed = ['company_profiles', 'company_profile_links', 'company_profile_facts', 'company_profile_reviews']
assert list(columns) == allowed, 'Unexpected seed tables'
conn = psycopg2.connect(os.environ['DATABASE_URL'], connect_timeout=15,
                       options='-c statement_timeout=900000 -c lock_timeout=5000')
cur = conn.cursor()
for table in allowed:
    cur.execute(sql.SQL('SELECT EXISTS(SELECT 1 FROM public.{})').format(sql.Identifier(table)))
    assert not cur.fetchone()[0] or '--resume' in sys.argv, 'Use --resume only with the same reviewed seed'
cur.execute('SELECT EXISTS(SELECT 1 FROM public.company_profile_sync_orgs WHERE enabled)')
assert not cur.fetchone()[0], 'Disable initialization sync before loading an unfinished directory'
conn.commit()
nullable = {'company_profiles': {'corporate_number','representative_address'},
            'company_profile_links': {'master_id','item_id','list_id','sort_no','corporate_number'},
            'company_profile_facts': set(), 'company_profile_reviews': set()}
for table in allowed:
    started = time.monotonic()
    query = sql.SQL('COPY public.{} ({}) FROM STDIN WITH (FORMAT CSV)').format(
        sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, columns[table])))
    cur.execute(sql.SQL('SELECT count(*) FROM public.{}').format(sql.Identifier(table)))
    already = cur.fetchone()[0]
    conn.commit()
    with (directory / (table + '.csv')).open('r', encoding='utf-8', newline='') as source:
        reader = csv.reader(source)
        for _ in range(already): next(reader)
        done = already
        while True:
            batch = []
            for _ in range(5000):
                row = next(reader, None)
                if row is None: break
                batch.append(','.join('' if value == '' and key in nullable[table] else '"'+value.replace('"','""')+'"'
                                      for key,value in zip(columns[table],row))+'\n')
            if not batch: break
            cur.execute('SELECT pg_database_size(current_database())+(SELECT sum(size) FROM pg_ls_waldir()),current_setting(\'default_transaction_read_only\')')
            size, read_only = cur.fetchone()
            assert size < budget_gib * 1024**3 and read_only == 'off', 'Storage guard stopped the seed before disk exhaustion'
            cur.copy_expert(query.as_string(conn), io.StringIO(''.join(batch)))
            conn.commit()
            done += len(batch)
            if done % 50000 == 0:
                print(json.dumps({'table': table, 'committed_rows': done, 'database_and_wal_mb': round(size/1024**2)}), flush=True)
            # Give archiving/checkpoints and interactive workloads time to advance.
            time.sleep(0.2)
    cur.execute(sql.SQL('SELECT count(*) FROM public.{}').format(sql.Identifier(table)))
    count = cur.fetchone()[0]
    expected = {'company_profiles': summary['uniqueCompanies'], 'company_profile_links': summary['totalSources'],
                'company_profile_facts': summary['facts'], 'company_profile_reviews': summary['identityReviews']}[table]
    assert count == expected, 'Seed count differs from reviewed plan'
    print(json.dumps({'table': table, 'rows': count, 'seconds': round(time.monotonic()-started, 1)}), flush=True)
conn.commit()
conn.autocommit = True
for table in allowed:
    cur.execute(sql.SQL('VACUUM (ANALYZE) public.{}').format(sql.Identifier(table)))
print(json.dumps({'committed': True, 'analyzed': allowed}), flush=True)
conn.close()
