import pandas as pd
import psycopg2
import psycopg2.extras
import json
import re
import time

DB_URI = "postgresql://postgres:3mxX16fa0qrRoqvw@db.baiiznjzvzhxwwqzsozn.supabase.co:5432/postgres"

PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
         '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
         '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
         '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
         '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
         '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
         '熊本県','大分県','宮崎県','鹿児島県','沖縄県']

def clean_str(v):
    if pd.isna(v) or v is None: return None
    s = str(v).strip()
    return s if s and s != 'nan' else None

def clean_int(v):
    if pd.isna(v) or v is None: return None
    s = str(v).replace(',', '').replace('千円', '').replace('人', '').strip()
    try: return int(float(s))
    except: return None

def extract_year(v):
    if pd.isna(v) or v is None: return None
    s = str(v).strip()
    m = re.match(r'(\d{4})', s)
    if m: return int(m.group(1))
    m2 = re.match(r'\w+-(\d{2,4})', s)
    if m2:
        y = int(m2.group(1))
        return y + 1900 if y < 100 else y
    return None

def extract_pref(addr):
    if not addr: return None
    for p in PREFS:
        if addr.startswith(p): return p
    return None

def strip_industry_code(v):
    """'0771 塗装工事業' -> '塗装工事業'"""
    if not v: return None
    s = str(v).strip()
    m = re.match(r'\d+\s+(.+)', s)
    return m.group(1) if m else s

def count_fields(row):
    return sum(1 for k, v in row.items() if v is not None and v != '' and k not in ('source_file',))


def read_taxi(path, fname):
    df = pd.read_excel(path, header=1, engine='openpyxl')
    rows = []
    for _, r in df.iterrows():
        name = clean_str(r.get('正式企業名'))
        if not name: continue
        rev = clean_int(r.get('決算1_売上高（千円）'))
        ni = clean_int(r.get('決算1_利益金（千円）'))
        rows.append({
            'company_name': name,
            'representative': clean_str(r.get('代表者氏名')),
            'postal_code': clean_str(r.get('企業郵便番号')),
            'prefecture': clean_str(r.get('都道府県')),
            'full_address': clean_str(r.get('企業所在地')),
            'phone': clean_str(str(r.get('企業電話番号', '')).replace(' ', '').replace('　', '')) or None,
            'established_year': extract_year(r.get('設立年月日（西暦）')),
            'capital_k': clean_int(r.get('資本金（千円）')),
            'employee_count': clean_int(r.get('従業員数')),
            'industry_sub': clean_str(r.get('業種名称1')),
            'revenue_k': rev,
            'net_income_k': ni,
            'tsr_id': clean_str(r.get('TSR企業コード')),
            'shareholders': clean_str(r.get('株主名称1')),
            'source_file': fname,
        })
    return rows

def read_masp_21(path, fname):
    df = pd.read_excel(path, engine='openpyxl')
    rows = []
    for _, r in df.iterrows():
        name = clean_str(r.get('商号（漢字）'))
        if not name: continue
        addr = clean_str(r.get('所在地'))
        rows.append({
            'company_name': name,
            'representative': clean_str(r.get('代表者名')),
            'postal_code': clean_str(str(r.get('郵便番号', '')).replace('〒', '').strip()) or None,
            'full_address': addr,
            'prefecture': extract_pref(addr),
            'phone': clean_str(r.get('電話番号')),
            'established_year': extract_year(r.get('設立年月')),
            'employee_count': clean_int(r.get('従業員数')),
            'industry_sub': clean_str(r.get('業種1')),
            'revenue_k': clean_int(r.get('最新売上（千円）') if '最新売上' in str(df.columns) else None),
            'net_income_k': clean_int(r.get('最新利益（千円）') if '最新利益' in str(df.columns) else None),
            'shareholders': clean_str(r.get('大株主')),
            'remarks': clean_str(r.get('概況')),
            'capital_k': clean_int(r.get('資本金（千円）')),
            'source_file': fname,
        })
    return rows

def read_masp_18(path, fname):
    df = pd.read_excel(path, engine='openpyxl')
    rows = []
    for _, r in df.iterrows():
        name = clean_str(r.get('商号（漢字）'))
        if not name: continue
        addr = clean_str(r.get('所在地'))
        rows.append({
            'company_name': name,
            'representative': clean_str(r.get('代表者名')),
            'postal_code': clean_str(r.get('郵便番号')),
            'full_address': addr,
            'prefecture': extract_pref(addr),
            'phone': clean_str(r.get('電話番号')),
            'established_year': extract_year(r.get('設立年月')),
            'capital_k': clean_int(r.get('資本金（千円）')),
            'employee_count': clean_int(r.get('従業員数')),
            'industry_sub': clean_str(r.get('業種1')),
            'source_file': fname,
        })
    return rows

def read_sourcing_csv(path, fname):
    df = pd.read_csv(path, encoding='cp932')
    rows = []
    for _, r in df.iterrows():
        name = clean_str(r.get('商号(漢字)'))
        if not name: continue
        addr = clean_str(r.get('所在地'))
        rows.append({
            'company_name': name,
            'representative': clean_str(r.get('代表者氏名')),
            'postal_code': clean_str(r.get('郵便番号')),
            'full_address': addr,
            'prefecture': extract_pref(addr),
            'phone': clean_str(r.get('電話番号')),
            'established_year': extract_year(r.get('設立年月')),
            'employee_count': clean_int(r.get('従業員数')),
            'industry_sub': strip_industry_code(r.get('業種1')),
            'revenue_k': clean_int(r.get('売上3')),
            'net_income_k': clean_int(r.get('利益3')),
            'shareholders': clean_str(r.get('大株主')),
            'remarks': clean_str(r.get('概況')),
            'source_file': fname,
        })
    return rows

def read_teleapo(path, fname):
    df = pd.read_excel(path, engine='openpyxl')
    rows = []
    for _, r in df.iterrows():
        name = clean_str(r.get('商号又は名称'))
        if not name: continue
        rep1 = clean_str(r.get('代表者の氏名①'))
        rep2 = clean_str(r.get('代表者の氏名②'))
        rep = f'{rep1}　{rep2}' if rep1 and rep2 else (rep1 or rep2)
        p1 = clean_str(r.get('電話番号①'))
        p2 = clean_str(r.get('電話番号②'))
        p3 = clean_str(r.get('電話番号③'))
        phone = f'{p1}-{p2}-{p3}' if p1 and p2 and p3 else None
        rows.append({
            'company_name': name,
            'representative': rep,
            'full_address': clean_str(r.get('主たる事務所の所在地')),
            'prefecture': extract_pref(clean_str(r.get('主たる事務所の所在地'))),
            'phone': phone,
            'employee_count': clean_int(r.get('総従事者数')),
            'source_file': fname,
        })
    return rows

def read_crane(path, fname):
    df = pd.read_excel(path, engine='openpyxl')
    rows = []
    for _, r in df.iterrows():
        name = clean_str(r.get('会社名'))
        if not name: continue
        addr = clean_str(r.get('住所'))
        rows.append({
            'company_name': name,
            'postal_code': clean_str(r.get('〒')),
            'full_address': addr,
            'prefecture': extract_pref(addr),
            'phone': clean_str(r.get('電話')),
            'revenue_k': clean_int(r.get('売上（千円）')),
            'source_file': fname,
        })
    return rows


def main():
    configs = [
        (r'C:\Users\篠宮拓武\Downloads\【M&Aソーシングパートナーズ株式会社御中】タクシーリスト_20251226 (1).xlsx', 'タクシーリスト', read_taxi),
        (r'C:\Users\篠宮拓武\Downloads\【MASP御中】その他製造・ゼネコン・ハウスメーカー_売上8～50億円_20251029.xlsx', '製造ゼネコン', read_masp_21),
        (r'C:\Users\篠宮拓武\Downloads\【MASP御中】_20260120_福祉用具（静岡）.xlsx', '福祉用具', read_masp_18),
        (r'C:\Users\篠宮拓武\Downloads\【MASP御中】_20260120_静岡.xlsx', '静岡', read_masp_18),
        (r'C:\Users\篠宮拓武\Downloads\【MASP御中】_20260120_ビルメン.xlsx', 'ビルメン', read_masp_18),
        (r'C:\Users\篠宮拓武\Downloads\【MASP 御中】ソーシングリスト (2).csv', 'ソーシングCSV', read_sourcing_csv),
        (r'C:\Users\篠宮拓武\Downloads\251127　テレアポリスト_提示.xlsx', 'テレアポ不動産', read_teleapo),
        (r'C:\Users\篠宮拓武\Downloads\クレーン業界.xlsx', 'クレーン', read_crane),
    ]

    all_rows = []
    for path, label, reader in configs:
        fname = path.split('\\')[-1]
        print(f'Reading {label} ({fname[:50]})...', flush=True)
        rows = reader(path, fname)
        print(f'  -> {len(rows)} rows')
        all_rows.extend(rows)

    print(f'\nTotal: {len(all_rows):,} rows')
    print('(的場ファイルはxls形式破損のためスキップ)')

    # DB
    conn = psycopg2.connect(DB_URI, options='-c statement_timeout=300000')
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute('SELECT count(*) FROM company_master')
    before = cur.fetchone()[0]
    print(f'Existing: {before:,}')

    # Dedup
    print('\nChecking duplicates...', flush=True)
    BATCH = 500
    new_rows, update_rows, skip_rows = [], [], []

    for i in range(0, len(all_rows), BATCH):
        batch = all_rows[i:i+BATCH]
        match_data = json.dumps([{
            'row_index': i+j, 'company_name': r.get('company_name',''), 'representative': r.get('representative',''),
        } for j, r in enumerate(batch)])
        cur.execute("SELECT * FROM match_company_duplicates(%s::jsonb)", (match_data,))
        matches = {row[0]: row for row in cur.fetchall()}
        for j, r in enumerate(batch):
            match = matches.get(i+j)
            if not match:
                new_rows.append(r)
            elif count_fields(r) > match[4]:
                update_rows.append({**r, 'id': match[1]})
            else:
                skip_rows.append((r['company_name'], match[2]))

    print(f'\n=== 重複チェック結果 ===')
    print(f'  新規追加: {len(new_rows):,}')
    print(f'  上書き更新: {len(update_rows):,}')
    print(f'  スキップ: {len(skip_rows):,}')
    if skip_rows:
        print(f'  スキップ例:')
        for imp, ex in skip_rows[:5]:
            print(f'    {imp} = {ex}')

    # Insert
    if new_rows:
        print(f'\nInserting {len(new_rows):,}...', flush=True)
        cols = ['company_name','business_description','postal_code','prefecture','city',
                'address','full_address','revenue_k','net_income_k','ordinary_income_k',
                'capital_k','established_year','representative','representative_age',
                'employee_count','industry_major','industry_sub','phone','tsr_id',
                'remarks','source_file','shareholders','officers']
        sql = f"INSERT INTO company_master ({','.join(cols)}) VALUES ({','.join(['%s']*len(cols))})"
        vals = [tuple(r.get(c) for c in cols) for r in new_rows]
        psycopg2.extras.execute_batch(cur, sql, vals, page_size=500)
        print('  Done')

    if update_rows:
        print(f'Updating {len(update_rows):,}...', flush=True)
        for r in update_rows:
            sets, vals = [], []
            for col in ['company_name','business_description','prefecture','full_address',
                        'revenue_k','net_income_k','capital_k','established_year','representative',
                        'representative_age','employee_count','industry_sub','phone',
                        'shareholders','remarks','source_file']:
                v = r.get(col)
                if v is not None and v != '':
                    sets.append(f"{col} = COALESCE(%s, {col})")
                    vals.append(v)
            if sets:
                vals.append(r['id'])
                cur.execute(f"UPDATE company_master SET {','.join(sets)} WHERE id = %s", vals)
        print('  Done')

    cur.execute('SELECT count(*) FROM company_master')
    after = cur.fetchone()[0]
    print(f'\n=== 完了 ===')
    print(f'  Before: {before:,}')
    print(f'  After:  {after:,}')
    print(f'  差分:   +{after - before:,}')
    conn.close()

if __name__ == '__main__':
    main()
