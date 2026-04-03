"""
Import company_master CSV into Supabase via REST API (PostgREST bulk insert).
Uses service_role key to bypass RLS.
"""
import pandas as pd
import requests
import os
import sys
import json
import math
import time

CSV_PATH = r"C:\Users\篠宮拓武\OneDrive\ドキュメント\MASP\①リスト\弊社リスト\company_master_import.csv"
SUPABASE_URL = "https://cglfhuqzoeanuglbpnym.supabase.co"

# Get service role key from environment
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SERVICE_ROLE_KEY:
    print("ERROR: Set SUPABASE_SERVICE_ROLE_KEY environment variable")
    print('  export SUPABASE_SERVICE_ROLE_KEY="your-key-here"')
    sys.exit(1)

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

BATCH_SIZE = 500

def clean_row(row):
    """Convert a pandas row to a clean dict for JSON."""
    d = {}
    for col, val in row.items():
        if pd.isna(val) or val is None or str(val).strip() == '' or str(val) == 'nan':
            d[col] = None
        elif col in ('revenue_k', 'net_income_k', 'ordinary_income_k', 'capital_k',
                     'established_year', 'representative_age', 'employee_count'):
            try:
                d[col] = int(float(val))
            except:
                d[col] = None
        else:
            d[col] = str(val)
    return d

def main():
    print(f"Reading CSV: {CSV_PATH}")
    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig', low_memory=False)
    print(f"Total rows: {len(df):,}")

    # Check existing count
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/company_master?select=id&limit=1",
        headers={**HEADERS, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
    )
    existing = int(resp.headers.get('content-range', '*/0').split('/')[-1])
    print(f"Existing rows: {existing:,}")

    if existing > 0:
        start_idx = existing
        print(f"Resuming from row {start_idx}")
    else:
        start_idx = 0

    n_batches = math.ceil((len(df) - start_idx) / BATCH_SIZE)
    print(f"Batches to process: {n_batches}")

    url = f"{SUPABASE_URL}/rest/v1/company_master"
    errors = 0
    start_time = time.time()

    for batch_num in range(n_batches):
        offset = start_idx + batch_num * BATCH_SIZE
        chunk = df.iloc[offset:offset + BATCH_SIZE]
        rows = [clean_row(row) for _, row in chunk.iterrows()]

        try:
            resp = requests.post(url, headers=HEADERS, json=rows, timeout=60)
            if resp.status_code not in (200, 201):
                print(f"\nERROR batch {batch_num} (rows {offset}-{offset+len(chunk)}): {resp.status_code}")
                print(resp.text[:500])
                errors += 1
                if errors > 5:
                    print("Too many errors, stopping.")
                    break
                time.sleep(2)
                continue
        except requests.exceptions.RequestException as e:
            print(f"\nNetwork error batch {batch_num}: {e}")
            errors += 1
            time.sleep(5)
            continue

        if (batch_num + 1) % 20 == 0 or batch_num == n_batches - 1:
            elapsed = time.time() - start_time
            rows_done = (batch_num + 1) * BATCH_SIZE
            rate = rows_done / elapsed if elapsed > 0 else 0
            eta = (len(df) - start_idx - rows_done) / rate if rate > 0 else 0
            print(f"  Batch {batch_num+1}/{n_batches} | {offset+len(chunk):,} rows | {rate:.0f} rows/s | ETA {eta/60:.1f}min", flush=True)

    elapsed = time.time() - start_time
    print(f"\nDone! {elapsed/60:.1f} minutes, {errors} errors")

if __name__ == "__main__":
    main()
