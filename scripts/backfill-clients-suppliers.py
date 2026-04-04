"""
既存company_masterにclients(取引先/販売先)とsuppliers(仕入先)を追加投入する。
企業名+代表者のnormalized matchで既存行を特定してUPDATE。
"""
import pandas as pd
import psycopg2
import re
import time

DB_URI = "postgresql://postgres:3mxX16fa0qrRoqvw@db.baiiznjzvzhxwwqzsozn.supabase.co:5432/postgres"
TSR_DIR = r"C:\Users\篠宮拓武\OneDrive\ドキュメント\MASP\①リスト\弊社リスト"
CLIENT_DIR = r"C:\Users\篠宮拓武\tmp_import"

def cs(v):
    if pd.isna(v) or v is None: return None
    s = str(v).strip()
    return s if s and s != 'nan' else None

def normalize_name(name):
    if not name: return ''
    s = str(name)
    for pat in ['株式会社','（株）','(株)','㈱','有限会社','（有）','(有)','㈲',
                '合同会社','合資会社','合名会社','一般社団法人','一般財団法人',
                '公益社団法人','公益財団法人','医療法人社団','医療法人財団',
                '医療法人','社会福祉法人','特定非営利活動法人','NPO法人']:
        s = s.replace(pat, '')
    fw = 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９'
    hw = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    s = s.translate(str.maketrans(fw, hw))
    s = re.sub(r'[\s\u3000]+', '', s)
    return s.lower()

def main():
    conn = psycopg2.connect(DB_URI, options='-c statement_timeout=300000')
    conn.autocommit = True
    cur = conn.cursor()

    updated = 0
    start = time.time()

    # ===== 弊社リスト (取引先) =====
    tsr_files = [
        ('IT_13,867社.xlsx', '業種1', '取引先'),
        ('ガス_10,228社.xlsx', '業種1', '取引先'),
        ('介護_5,635社.xlsx', '業種1', '取引先'),
        ('建設_200,854社.xlsx', '中業種', '取引先'),
        ('歯科_4,931社.xlsx', '業種1', '主要取引先'),
        ('製造_121,830社.xlsx', '業種1', '取引先'),
        ('全業種_30,767社.xlsx', '業種1', '取引先'),
        ('全業種②_9,709社.xlsx', '業種1', '取引先'),
        ('物流_31,968社.xlsx', '業種1', '取引先'),
        ('調剤_2,647社.xlsx', '業種1', '主要取引先'),
        ('病院_4,307社.xlsx', '業種1', '主要取引先'),
        ('不動産_42,730社.xlsx', '業種1', '取引先'),
    ]

    for fname, _, client_col in tsr_files:
        path = f"{TSR_DIR}\\{fname}"
        print(f'Reading {fname}...', flush=True)
        try:
            cols = pd.read_excel(path, nrows=0, engine='openpyxl').columns.tolist()
            if client_col not in cols:
                print(f'  {client_col} not found, skipping')
                continue
            df = pd.read_excel(path, engine='openpyxl', usecols=['企業名', '代表者', client_col])
        except Exception as e:
            print(f'  Error: {e}')
            continue

        batch_updates = []
        for _, r in df.iterrows():
            name = cs(r.get('企業名'))
            rep = cs(r.get('代表者'))
            val = cs(r.get(client_col))
            if not name or not val:
                continue
            n_name = normalize_name(name)
            n_rep = normalize_name(rep) if rep else ''
            batch_updates.append((val, n_name, n_rep))

        # Batch UPDATE
        if batch_updates:
            for i in range(0, len(batch_updates), 1000):
                batch = batch_updates[i:i+1000]
                for val, n_name, n_rep in batch:
                    if n_rep:
                        cur.execute(
                            "UPDATE company_master SET clients = %s WHERE normalized_name = %s AND normalized_representative = %s AND clients IS NULL",
                            (val, n_name, n_rep))
                    else:
                        cur.execute(
                            "UPDATE company_master SET clients = %s WHERE normalized_name = %s AND clients IS NULL",
                            (val, n_name))
                    updated += cur.rowcount
            print(f'  Updated {updated} total so far')

    # ===== 架電リスト (販売先/仕入先) =====
    import os
    if os.path.exists(CLIENT_DIR):
        for fname in sorted(os.listdir(CLIENT_DIR)):
            if not fname.endswith('.xlsx'):
                continue
            path = f"{CLIENT_DIR}\\{fname}"
            try:
                cols = pd.read_excel(path, nrows=0, engine='openpyxl').columns.tolist()
            except:
                continue

            has_sales = '販売先' in cols
            has_purchase = '仕入先' in cols
            if not has_sales and not has_purchase:
                continue

            print(f'Reading {fname}...', flush=True)
            use = ['取引先名', '代表者氏名']
            if has_sales: use.append('販売先')
            if has_purchase: use.append('仕入先')
            try:
                df = pd.read_excel(path, engine='openpyxl', usecols=use)
            except:
                continue

            for _, r in df.iterrows():
                name = cs(r.get('取引先名'))
                rep = cs(r.get('代表者氏名'))
                sales = cs(r.get('販売先')) if has_sales else None
                purchase = cs(r.get('仕入先')) if has_purchase else None
                if not name:
                    continue
                n_name = normalize_name(name)
                n_rep = normalize_name(rep) if rep else ''

                if sales:
                    if n_rep:
                        cur.execute("UPDATE company_master SET clients = %s WHERE normalized_name = %s AND normalized_representative = %s AND clients IS NULL", (sales, n_name, n_rep))
                    else:
                        cur.execute("UPDATE company_master SET clients = %s WHERE normalized_name = %s AND clients IS NULL", (sales, n_name))
                    updated += cur.rowcount

                if purchase:
                    if n_rep:
                        cur.execute("UPDATE company_master SET suppliers = %s WHERE normalized_name = %s AND normalized_representative = %s AND suppliers IS NULL", (purchase, n_name, n_rep))
                    else:
                        cur.execute("UPDATE company_master SET suppliers = %s WHERE normalized_name = %s AND suppliers IS NULL", (purchase, n_name))
                    updated += cur.rowcount

            print(f'  Updated {updated} total so far')

    # Also handle ソーシングCSV and other download files
    dl_configs = [
        (r'C:\Users\篠宮拓武\Downloads\【MASP 御中】ソーシングリスト (2).csv', 'csv', '商号(漢字)', '代表者氏名', '販売先', '仕入先'),
        (r'C:\Users\篠宮拓武\Downloads\ソーシングリスト_的場_MASP御中.xlsx', 'xlsx', '商号（漢字）', '代表者名', '販売先', '仕入先'),
    ]
    for path, fmt, name_col, rep_col, sales_col, purchase_col in dl_configs:
        try:
            if fmt == 'csv':
                df = pd.read_csv(path, encoding='cp932')
            else:
                df = pd.read_excel(path, engine='openpyxl')
        except:
            continue

        has_s = sales_col in df.columns
        has_p = purchase_col in df.columns
        if not has_s and not has_p:
            continue

        print(f'Reading {path.split(chr(92))[-1]}...', flush=True)
        for _, r in df.iterrows():
            name = cs(r.get(name_col))
            rep = cs(r.get(rep_col))
            if not name: continue
            n_name = normalize_name(name)
            n_rep = normalize_name(rep) if rep else ''

            if has_s and cs(r.get(sales_col)):
                cur.execute("UPDATE company_master SET clients = %s WHERE normalized_name = %s AND normalized_representative = %s AND clients IS NULL",
                    (cs(r.get(sales_col)), n_name, n_rep))
                updated += cur.rowcount
            if has_p and cs(r.get(purchase_col)):
                cur.execute("UPDATE company_master SET suppliers = %s WHERE normalized_name = %s AND normalized_representative = %s AND suppliers IS NULL",
                    (cs(r.get(purchase_col)), n_name, n_rep))
                updated += cur.rowcount

    elapsed = time.time() - start

    # Final stats
    cur.execute("SELECT count(clients) FROM company_master")
    c_count = cur.fetchone()[0]
    cur.execute("SELECT count(suppliers) FROM company_master")
    s_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM company_master")
    total = cur.fetchone()[0]

    print(f'\n=== 完了 ({elapsed:.0f}s) ===')
    print(f'  取引先/販売先あり: {c_count:,} / {total:,} ({c_count/total*100:.1f}%)')
    print(f'  仕入先あり: {s_count:,} / {total:,} ({s_count/total*100:.1f}%)')

    conn.close()

if __name__ == '__main__':
    main()
