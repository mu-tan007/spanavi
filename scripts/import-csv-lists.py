import pandas as pd
import psycopg2
import psycopg2.extras
import json
import re
import time

DB_URI = "postgresql://postgres:3mxX16fa0qrRoqvw@db.baiiznjzvzhxwwqzsozn.supabase.co:5432/postgres"

files = [
    r'C:\Users\篠宮拓武\Downloads\舟山 拓見_関東社員用架電対象登録完了データ_2026-04-02T10_37_46.6338418Z (1).csv',
    r'C:\Users\篠宮拓武\Downloads\関東版データ抽出CSV_舟山 拓見_2026-02-10T03_23_11 (1).csv',
    r'C:\Users\篠宮拓武\Downloads\関東版データ抽出CSV_上川 雄也_2026-02-10T23_00_12 (1).csv',
    r'C:\Users\篠宮拓武\Downloads\舟山 拓見_社員用架電対象登録完了データ_2026-02-25T05_11_32.9653319Z (1).csv',
    r'C:\Users\篠宮拓武\Downloads\舟山 拓見_社員用架電対象登録完了データ_2026-03-02T08_45_14.9698284Z (1).csv',
    r'C:\Users\篠宮拓武\Downloads\舟山 拓見_社員用架電対象登録完了データ_2026-04-01T06_53_19.2407848Z (1).csv',
]

PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
         '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
         '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
         '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
         '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
         '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
         '熊本県','大分県','宮崎県','鹿児島県','沖縄県']

def clean_str(v):
    if pd.isna(v) or v is None:
        return None
    s = str(v).strip()
    return s if s and s != 'nan' else None

def clean_int(v):
    if pd.isna(v) or v is None:
        return None
    s = str(v).replace(',', '').strip()
    try:
        return int(float(s))
    except:
        return None

def extract_year(v):
    if pd.isna(v) or v is None:
        return None
    s = str(v).strip()
    m = re.match(r'(\d{4})', s)
    if m:
        return int(m.group(1))
    m2 = re.match(r'\w+-(\d{2,4})', s)
    if m2:
        y = int(m2.group(1))
        return y + 1900 if y < 100 else y
    return None

def count_fields(row):
    return sum(1 for k, v in row.items() if v is not None and v != '' and k not in ('source_file',))

all_rows = []
for f in files:
    fname = f.split('\\')[-1]
    print(f'Reading {fname[:60]}...', flush=True)
    df = pd.read_csv(f, encoding='utf-8-sig')

    for _, r in df.iterrows():
        company = clean_str(r.get('L:商号（漢字）'))
        if not company:
            continue

        industry_sub = clean_str(r.get('001_業種１_filter')) or clean_str(r.get('0001_業種１_filter'))
        industry_major = clean_str(r.get('002_業種大分類_filter'))
        prefecture = clean_str(r.get('L:都道府県'))
        address_full = clean_str(r.get('L:所在地'))

        if not prefecture and address_full:
            for pref in PREFS:
                if address_full.startswith(pref):
                    prefecture = pref
                    break

        # Revenue: try latest first
        rev = clean_int(r.get('010_最新売上_filter'))
        if rev is None:
            for col in [' L:売上（千円）＿３', ' L:売上（千円）＿２', ' L:売上（千円）＿１']:
                rev = clean_int(r.get(col))
                if rev is not None:
                    break

        ni = None
        for col in [' 業績データ２＿３', ' 業績データ２＿２', ' 業績データ２＿１']:
            ni = clean_int(r.get(col))
            if ni is not None:
                break

        row = {
            'company_name': company,
            'representative': clean_str(r.get('L:代表者氏名')),
            'representative_age': clean_int(r.get('L:年齢')),
            'full_address': address_full,
            'prefecture': prefecture,
            'phone': clean_str(r.get('L:電話番号')),
            'business_description': clean_str(r.get('005_営業種目_filter')),
            'industry_sub': industry_sub,
            'industry_major': industry_major,
            'revenue_k': rev,
            'net_income_k': ni,
            'employee_count': clean_int(r.get('L:従業員数')),
            'established_year': extract_year(r.get('L:設立年月日')),
            'shareholders': clean_str(r.get('L:大株主')),
            'source_file': fname,
        }
        all_rows.append(row)

    print(f'  -> {len(df)} rows read')

print(f'\nTotal import rows: {len(all_rows):,}')

# Connect
conn = psycopg2.connect(DB_URI, options='-c statement_timeout=300000')
conn.autocommit = True
cur = conn.cursor()

cur.execute('SELECT count(*) FROM company_master')
before_count = cur.fetchone()[0]
print(f'Existing DB rows: {before_count:,}')

# Dedup
print('\nChecking duplicates...', flush=True)
BATCH = 500
new_rows = []
update_rows = []
skip_rows = []

for i in range(0, len(all_rows), BATCH):
    batch = all_rows[i:i+BATCH]
    match_data = json.dumps([{
        'row_index': i + j,
        'company_name': r.get('company_name', ''),
        'representative': r.get('representative', ''),
    } for j, r in enumerate(batch)])

    cur.execute("SELECT * FROM match_company_duplicates(%s::jsonb)", (match_data,))
    matches = {row[0]: row for row in cur.fetchall()}

    for j, r in enumerate(batch):
        idx = i + j
        match = matches.get(idx)
        if not match:
            new_rows.append(r)
        else:
            if count_fields(r) > match[4]:
                update_rows.append({**r, 'id': match[1]})
            else:
                skip_rows.append((r['company_name'], match[2]))

print(f'\n=== 重複チェック結果 ===')
print(f'  新規追加: {len(new_rows):,}')
print(f'  上書き更新: {len(update_rows):,}')
print(f'  スキップ: {len(skip_rows):,}')

if skip_rows:
    print(f'\n  スキップ例（先頭5件）:')
    for imp, ex in skip_rows[:5]:
        print(f'    {imp} = {ex}')

# Insert
if new_rows:
    print(f'\nInserting {len(new_rows):,} new rows...', flush=True)
    cols = ['company_name', 'business_description', 'postal_code', 'prefecture', 'city',
            'address', 'full_address', 'revenue_k', 'net_income_k', 'ordinary_income_k',
            'capital_k', 'established_year', 'representative', 'representative_age',
            'employee_count', 'industry_major', 'industry_sub', 'phone', 'tsr_id',
            'remarks', 'source_file', 'shareholders', 'officers']
    insert_sql = f"INSERT INTO company_master ({','.join(cols)}) VALUES ({','.join(['%s'] * len(cols))})"
    values = [tuple(r.get(c) for c in cols) for r in new_rows]
    psycopg2.extras.execute_batch(cur, insert_sql, values)
    print('  Done')

# Update
if update_rows:
    print(f'Updating {len(update_rows):,} rows...', flush=True)
    for r in update_rows:
        sets, vals = [], []
        for col in ['company_name', 'business_description', 'prefecture', 'full_address',
                    'revenue_k', 'net_income_k', 'established_year', 'representative',
                    'representative_age', 'employee_count', 'industry_sub', 'industry_major',
                    'phone', 'shareholders', 'source_file']:
            v = r.get(col)
            if v is not None and v != '':
                sets.append(f"{col} = COALESCE(%s, {col})")
                vals.append(v)
        if sets:
            vals.append(r['id'])
            cur.execute(f"UPDATE company_master SET {','.join(sets)} WHERE id = %s", vals)
    print('  Done')

cur.execute('SELECT count(*) FROM company_master')
after_count = cur.fetchone()[0]
print(f'\n=== 完了 ===')
print(f'  Before: {before_count:,}')
print(f'  After:  {after_count:,}')
print(f'  差分:   +{after_count - before_count:,}')
conn.close()
