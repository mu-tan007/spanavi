"""
クライアント架電リスト15ファイルをcompany_masterにインポート
重複排除: normalized_name + normalized_representative で照合
情報量が多い方を残す
"""
import pandas as pd
import psycopg2
import psycopg2.extras
import json
import os
import time
import re

DB_URI = "postgresql://postgres:3mxX16fa0qrRoqvw@db.baiiznjzvzhxwwqzsozn.supabase.co:5432/postgres"
DATA_DIR = r"C:\Users\篠宮拓武\tmp_import"

def normalize_name_py(name):
    """Python版の企業名正規化（DB側と同じロジック）"""
    if not name or pd.isna(name):
        return ''
    s = str(name)
    # Strip corporate suffixes
    for pat in ['株式会社', '（株）', '(株)', '㈱', '有限会社', '（有）', '(有)', '㈲',
                '合同会社', '合資会社', '合名会社', '一般社団法人', '一般財団法人',
                '公益社団法人', '公益財団法人', '医療法人社団', '医療法人財団',
                '医療法人', '社会福祉法人', '特定非営利活動法人', 'NPO法人']:
        s = s.replace(pat, '')
    # Full-width to half-width
    fw = 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９'
    hw = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    trans = str.maketrans(fw, hw)
    s = s.translate(trans)
    # Remove whitespace
    s = re.sub(r'[\s\u3000]+', '', s)
    return s.lower()

def clean_str(v):
    if pd.isna(v) or v is None:
        return None
    s = str(v).strip()
    return s if s and s != 'nan' else None

def clean_int(v):
    if pd.isna(v) or v is None:
        return None
    s = str(v).replace(',', '').replace(' ', '').replace('千円', '').replace('人', '').strip()
    try:
        return int(float(s))
    except:
        return None

def extract_year(v):
    if pd.isna(v) or v is None:
        return None
    s = str(v).strip()
    m = re.match(r'(\d{4})', s)
    return int(m.group(1)) if m else None

def read_pattern_a(filepath, fname):
    """31列パターン（大半のファイル）"""
    df = pd.read_excel(filepath, engine='openpyxl')
    rows = []
    for _, r in df.iterrows():
        rows.append({
            'company_name': clean_str(r.get('取引先名')),
            'representative': clean_str(r.get('代表者氏名')),
            'postal_code': clean_str(r.get('郵便番号(請求先)')),
            'prefecture': clean_str(r.get('都道府県(請求先)')),
            'city': clean_str(r.get('市区郡(請求先)')),
            'address': clean_str(r.get('町名・番地(請求先)')),
            'phone': clean_str(r.get('電話')),
            'established_year': extract_year(r.get('設立年月')),
            'capital_k': clean_int(r.get('資本金')),
            'employee_count': clean_int(r.get('従業員数')),
            'industry_sub': clean_str(str(r.get('第1業種', '')).split(' ', 1)[-1]) if pd.notna(r.get('第1業種')) else None,
            'business_description': clean_str(r.get('営業種目')),
            'revenue_k': clean_int(r.get('売上（千円）3') or r.get('売上（千円）2') or r.get('売上（千円）1')),
            'net_income_k': clean_int(r.get('利益（千円）3') or r.get('利益（千円）2') or r.get('利益（千円）1')),
            'remarks': clean_str(r.get('概況')),
            'shareholders': clean_str(r.get('大株主')),
            'source_file': fname,
        })
    return [r for r in rows if r['company_name']]

def read_pattern_b(filepath, fname):
    """15列パターン（給排水）"""
    df = pd.read_excel(filepath, engine='openpyxl')
    rows = []
    for _, r in df.iterrows():
        rows.append({
            'company_name': clean_str(r.get('会社名')),
            'full_address': clean_str(r.get('所在地')),
            'employee_count': clean_int(r.get('従業員数')),
            'industry_sub': clean_str(r.get('業種')),
            'business_description': clean_str(r.get('営業種目')),
            'shareholders': clean_str(r.get('大株主')),
            'revenue_k': clean_int(r.get('売上3') or r.get('売上2') or r.get('売上1')),
            'net_income_k': clean_int(r.get('利益3') or r.get('利益2') or r.get('利益1')),
            'remarks': clean_str(r.get('概況')),
            'source_file': fname,
        })
    return [r for r in rows if r['company_name']]

def read_pattern_c(filepath, fname):
    """25列パターン（動物病院）"""
    df = pd.read_excel(filepath, engine='openpyxl')
    rows = []
    for _, r in df.iterrows():
        rows.append({
            'company_name': clean_str(r.get('称号(漢字)')),
            'representative': clean_str(r.get('代表者氏名')),
            'postal_code': clean_str(str(r.get('郵便番号', '')).replace('〒', '').strip()) or None,
            'full_address': clean_str(r.get('所在地')),
            'phone': clean_str(r.get('電話番号')),
            'established_year': extract_year(r.get('設立年月')),
            'capital_k': clean_int(r.get('資本金')),
            'employee_count': clean_int(r.get('従業員数')),
            'industry_sub': clean_str(str(r.get('業種', '')).split(' ', 1)[-1]) if pd.notna(r.get('業種')) else None,
            'business_description': clean_str(r.get('営業種目')),
            'revenue_k': clean_int(r.get('売上')),
            'net_income_k': clean_int(r.get('利益')),
            'shareholders': clean_str(r.get('大株主')),
            'officers': clean_str(r.get('役員')),
            'remarks': clean_str(r.get('概況')),
            'source_file': fname,
        })
    return [r for r in rows if r['company_name']]


def count_fields(row):
    return sum(1 for k, v in row.items() if v is not None and v != '' and k not in ('source_file',))


def main():
    # Read all files
    files = sorted(os.listdir(DATA_DIR))
    all_rows = []

    for fname in files:
        if not fname.endswith('.xlsx'):
            continue
        filepath = os.path.join(DATA_DIR, fname)
        print(f'Reading {fname}...', flush=True)

        if '給排水' in fname:
            rows = read_pattern_b(filepath, fname)
        elif '動物病院' in fname:
            rows = read_pattern_c(filepath, fname)
        else:
            rows = read_pattern_a(filepath, fname)

        print(f'  -> {len(rows)} rows')
        all_rows.extend(rows)

    print(f'\nTotal import rows: {len(all_rows):,}')

    # Connect to DB
    conn = psycopg2.connect(DB_URI, options='-c statement_timeout=300000')
    conn.autocommit = True
    cur = conn.cursor()

    # Get existing count
    cur.execute('SELECT count(*) FROM company_master')
    before_count = cur.fetchone()[0]
    print(f'Existing DB rows: {before_count:,}')

    # Match duplicates
    print('\nChecking duplicates...', flush=True)
    BATCH = 500
    new_rows = []
    update_rows = []
    skip_rows = []

    for i in range(0, len(all_rows), BATCH):
        batch = all_rows[i:i+BATCH]
        # Build JSONB for matching
        match_data = json.dumps([{
            'row_index': i + j,
            'company_name': r.get('company_name', ''),
            'representative': r.get('representative', ''),
        } for j, r in enumerate(batch)])

        cur.execute("SELECT * FROM match_company_duplicates(%s::jsonb)", (match_data,))
        matches = {row[0]: row for row in cur.fetchall()}  # row_index -> match

        for j, r in enumerate(batch):
            idx = i + j
            match = matches.get(idx)
            if not match:
                new_rows.append(r)
            else:
                existing_field_count = match[4]
                import_field_count = count_fields(r)
                if import_field_count > existing_field_count:
                    update_rows.append({**r, 'id': match[1]})
                else:
                    skip_rows.append((r['company_name'], match[2]))

    print(f'\n=== 重複チェック結果 ===')
    print(f'  新規追加: {len(new_rows):,}')
    print(f'  上書き更新（インポート側の情報が多い）: {len(update_rows):,}')
    print(f'  スキップ（既存の情報が多い）: {len(skip_rows):,}')

    if skip_rows:
        print(f'\n  スキップ例（先頭5件）:')
        for imp_name, ex_name in skip_rows[:5]:
            print(f'    {imp_name} = {ex_name}')

    # Execute inserts
    if new_rows:
        print(f'\nInserting {len(new_rows):,} new rows...', flush=True)
        cols = ['company_name', 'business_description', 'postal_code', 'prefecture', 'city',
                'address', 'full_address', 'revenue_k', 'net_income_k', 'ordinary_income_k',
                'capital_k', 'established_year', 'representative', 'representative_age',
                'employee_count', 'industry_major', 'industry_sub', 'phone', 'tsr_id',
                'remarks', 'source_file', 'shareholders', 'officers']

        insert_sql = f"INSERT INTO company_master ({','.join(cols)}) VALUES ({','.join(['%s'] * len(cols))})"

        start = time.time()
        for i in range(0, len(new_rows), BATCH):
            batch = new_rows[i:i+BATCH]
            values = [tuple(r.get(c) for c in cols) for r in batch]
            psycopg2.extras.execute_batch(cur, insert_sql, values)
            if (i // BATCH + 1) % 5 == 0 or i + BATCH >= len(new_rows):
                print(f'  {min(i+BATCH, len(new_rows)):,}/{len(new_rows):,}', flush=True)
        print(f'  Done in {time.time()-start:.1f}s')

    # Execute updates
    if update_rows:
        print(f'\nUpdating {len(update_rows):,} rows...', flush=True)
        for r in update_rows:
            sets = []
            vals = []
            for col in ['company_name', 'business_description', 'postal_code', 'prefecture', 'city',
                        'address', 'full_address', 'revenue_k', 'net_income_k', 'capital_k',
                        'established_year', 'representative', 'representative_age', 'employee_count',
                        'industry_sub', 'phone', 'remarks', 'source_file', 'shareholders', 'officers']:
                v = r.get(col)
                if v is not None and v != '':
                    sets.append(f"{col} = COALESCE(%s, {col})")
                    vals.append(v)
            if sets:
                vals.append(r['id'])
                cur.execute(f"UPDATE company_master SET {','.join(sets)} WHERE id = %s", vals)
        print('  Done')

    # Final count
    cur.execute('SELECT count(*) FROM company_master')
    after_count = cur.fetchone()[0]
    print(f'\n=== 完了 ===')
    print(f'  Before: {before_count:,}')
    print(f'  After:  {after_count:,}')
    print(f'  差分:   +{after_count - before_count:,}')

    conn.close()

if __name__ == '__main__':
    main()
