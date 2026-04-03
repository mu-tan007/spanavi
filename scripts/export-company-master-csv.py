"""
全12ファイルの企業データを company_master テーブル用CSVに変換する。
分類済みの大分類・細分類を付与する。
"""
import pandas as pd
import re
import os
import datetime

DATA_DIR = r"C:\Users\篠宮拓武\OneDrive\ドキュメント\MASP\①リスト\弊社リスト"
OUTPUT_CSV = os.path.join(DATA_DIR, "company_master_import.csv")

files_config = [
    ('IT_13,867社.xlsx', '業種1'),
    ('ガス_10,228社.xlsx', '業種1'),
    ('介護_5,635社.xlsx', '業種1'),
    ('建設_200,854社.xlsx', '中業種'),
    ('歯科_4,931社.xlsx', '業種1'),
    ('製造_121,830社.xlsx', '業種1'),
    ('全業種_30,767社.xlsx', '業種1'),
    ('全業種②_9,709社.xlsx', '業種1'),
    ('物流_31,968社.xlsx', '業種1'),
    ('調剤_2,647社.xlsx', '業種1'),
    ('病院_4,307社.xlsx', '業種1'),
    ('不動産_42,730社.xlsx', '業種1'),
]

# Column mapping: Japanese -> DB column
# We read all available columns and map them
def read_file(fname, industry_col):
    filepath = os.path.join(DATA_DIR, fname)
    print(f"Reading {fname}...", flush=True)
    df = pd.read_excel(filepath, engine='openpyxl')

    result = pd.DataFrame()
    result['company_name'] = df.get('企業名')
    result['business_description'] = df.get('事業内容')
    result['postal_code'] = df.get('郵便番号(請求先)')
    result['prefecture'] = df.get('都道府県')
    result['city'] = df.get('市区郡(請求先)')
    result['address'] = df.get('町名・番地(請求先)')

    # full_address = 都道府県 + 市区郡 + 町名番地
    pref = df.get('都道府県', pd.Series(dtype=str)).fillna('')
    city = df.get('市区郡(請求先)', pd.Series(dtype=str)).fillna('')
    addr = df.get('町名・番地(請求先)', pd.Series(dtype=str)).fillna('')
    result['full_address'] = (pref.astype(str) + city.astype(str) + addr.astype(str)).replace('', None)

    result['revenue_k'] = pd.to_numeric(df.get('売上高(千円)'), errors='coerce')
    result['net_income_k'] = pd.to_numeric(df.get('当期純利益(千円)'), errors='coerce')
    result['ordinary_income_k'] = pd.to_numeric(df.get('経常利益'), errors='coerce')
    result['capital_k'] = pd.to_numeric(df.get('資本金(単位:千円)'), errors='coerce')

    # 設立年: might be datetime or int
    est = df.get('設立年')
    if est is not None:
        def extract_year(v):
            if pd.isna(v):
                return None
            if isinstance(v, (datetime.datetime, pd.Timestamp)):
                return v.year
            try:
                return int(v)
            except:
                return None
        result['established_year'] = est.apply(extract_year)
    else:
        result['established_year'] = None

    result['representative'] = df.get('代表者')
    result['shareholders'] = df.get('株主')
    result['officers'] = df.get('役員')

    # Age: 年齢 or 代表者年齢
    age_col = None
    if '年齢' in df.columns:
        age_col = '年齢'
    elif '代表者年齢' in df.columns:
        age_col = '代表者年齢'
    if age_col:
        result['representative_age'] = pd.to_numeric(df.get(age_col), errors='coerce')
    else:
        result['representative_age'] = None

    result['employee_count'] = pd.to_numeric(df.get('従業員数'), errors='coerce')
    result['industry_sub'] = df.get(industry_col)
    result['phone'] = df.get('電話番号')

    # TSRID
    tsr = df.get('TSRID')
    if tsr is not None:
        result['tsr_id'] = tsr.apply(lambda v: str(v).split('.')[0] if pd.notna(v) else None)
    else:
        result['tsr_id'] = None

    result['remarks'] = df.get('備考')
    result['source_file'] = fname

    print(f"  -> {len(result)} rows", flush=True)
    return result


# ===== 大分類マッピング関数 =====
def classify_major(name):
    if pd.isna(name):
        return None
    name = str(name)
    rules = [
        ('A 農業、林業', ['農業', '畜産', '酪農', '養鶏', '養豚', '肉用牛', '米作', '野菜作', '果樹', '花き', '種苗', '茶作', '工芸作物', '養蚕', '林業', '育林', '素材生産', '園芸サービス', 'きのこ', '穀作サービス', '特用林産物']),
        ('B 漁業', ['漁業', '養殖', '捕鯨', '採貝', '採藻']),
        ('D 建設業', ['工事業', '大工', '建設コンサルタント', '測量業', '建築設計', '地質調査', 'しゅんせつ', '建築リフォーム']),
        ('F 電気・ガス・熱供給・水道業', ['発電所', '電気供給', 'ガス供給', 'ガス業', '熱供給', '上水道', '下水道', '工業用水', 'ガス事業所', '電気事業']),
        ('G 情報通信業', ['ソフトウェア', '情報処理', '情報提供', 'インターネット', 'ポータルサイト', 'アプリケーション', '映画', 'テレビ', 'ラジオ', '新聞業', '出版業', '通信業', '電気通信', '放送業', 'サーバ運営', '情報記録物', 'ゲームソフト', 'ASP', 'ウェブコンテンツ', 'アニメーション制作', '映像・音声', 'ニュース供給', 'レコード制作']),
        ('H 運輸業、郵便業', ['運送', '運輸', '海運', '倉庫業', '港湾', '鉄道', '航空', 'タクシー', '旅客', 'こん包', '内航', '外航', '水運', '郵便', '配達', '宅配', '運送代理', '集配', '冷蔵倉庫', '駐車場', '自動車ターミナル', 'パイプライン', '船舶貸渡', '桟橋', '貨物荷扱', '飛行場', '索道', '軌道業']),
        ('I 卸売業、小売業', ['卸売', '小売', 'スーパー', '百貨店', 'コンビニ', 'ガソリンスタンド', '燃料小売', '商社', '仲卸', '問屋', '薬局', '薬店', '医薬品小売', '化粧品小売', '菓子小売', 'ペット・ペット用品小売', '自動車（新車）小売', '各種食料品小売', '電気機械器具小売', 'ドラッグストア', 'ホームセンター', '代理商', '仲立業', '質屋', 'その他の機械器具小売']),
        ('J 金融業、保険業', ['銀行', '信用金庫', '信用組合', '保険', '証券', '投資', 'ファンド', '金融', '貸金', 'クレジット', '信用保証', '損害査定', '非預金信用', '信託業', '先物取引']),
        ('K 不動産業、物品賃貸業', ['不動産', '土地売買', '建物売買', '貸事務所', '土地賃貸', '貸家', '賃貸', '物品賃貸', '自動車賃貸', '建設機械器具賃貸', '各種物品賃貸', '持株会社', '貸間業', 'リース']),
        ('L 学術研究、専門・技術サービス業', ['研究', '設計業', '機械設計', '経営コンサルタント', '専門サービス', '翻訳', '通訳', '広告', 'デザイン', '写真業', '非破壊検査', '計量証明', '獣医業', '法律事務', '公認会計', '税理士', '特許事務', '弁理士', '司法書士', '行政書士', '社会保険労務士', '検査業', '商品検査', '技術サービス', 'ディズプレイ', 'ディスプレイ', '土地家屋調査士']),
        ('M 宿泊業、飲食サービス業', ['旅館', 'ホテル', '宿泊', '食堂', 'レストラン', '料理店', '飲食', '喫茶', 'バー', '酒場', 'キャバレー', '給食', '配食', '簡易宿所', '料亭', '焼肉店', 'ラーメン店', 'すし店', 'そば・うどん店', 'お好み焼き', '下宿業']),
        ('N 生活関連サービス業、娯楽業', ['洗濯', 'クリーニング', '理容', '美容業', 'エステ', '結婚式場', '葬儀', '冠婚葬祭', 'ゴルフ場', 'ゴルフ練習', 'パチンコ', 'ボウリング', '遊園地', 'フィットネス', '娯楽', 'スポーツ施設', 'カラオケ', 'リネンサプライ', '貸衣', '衣服裁縫修理', '遊戯場', '写真現物', '競馬競技', '洗張・染物', '劇団', '演芸', 'ゲームセンター', 'マリーナ', '旅行業', '浴場', '生活関連', '動物園', '植物園', '水族館', '博物館', '美術館', 'テニス場', 'バッティング', 'テーマパーク', '競走場', '競技団', 'ダンスホール', '体育館', '競輪場', '興行場', '集会場', '公園', '芸術家']),
        ('O 教育、学習支援業', ['学校', '学習塾', '教育', '幼稚園', '大学', '高等学校', '中学校', '小学校', '専修学校', '自動車教習', '職業訓練', '教授業']),
        ('P 医療、福祉', ['病院', '診療所', '歯科', '医療', '福祉', '介護', '保育所', '老人', '障害者', '看護', '助産', 'あん摩', '指圧', '柔道整復', '鍼灸', '施術所', '薬局', '訪問介護', '通所', '短期入所', '認定こども園', '児童福祉', '調剤', '健康相談', '療術業', '居住支援', '保健衛生', '精神保健', '訪問看護']),
        ('Q 複合サービス事業', ['協同組合', '郵便局']),
        ('R サービス業（他に分類されないもの）', ['廃棄物', 'ごみ', '産業廃棄物', '浄化槽', 'ビルメンテナンス', '警備業', '労働者派遣', '事業サービス', '建物サービス', '機械修理', '政治団体', '宗教', '神社', '寺院', '教会', '整備業', '修理業', '複写業', '火葬業', '看板書き', '消毒業', '物品預り', 'し尿', '墓地', '職業紹介', '家事サービス', '清掃事務所', '非営利的団体', 'サービス業', '産業用設備洗浄', '印刷関連サービス']),
    ]
    for kw in ['鉱業', '採石', '砂利', '砕石', '砂・砂利']:
        if kw in name and '機械' not in name and '卸売' not in name:
            return 'C 鉱業、採石業、砂利採取業'
    for major, keywords in rules:
        for kw in keywords:
            if kw in name:
                return major
    mfg = ['製造業', '製造', '印刷業', '製版業', '製本業', '製材業', '製茶業', '精米', '精穀', '製粉', '醸造',
           '紡績', '織物', '編物', '染色', '整毛', '縫製', '鋳物', 'めっき', '鍛造', '圧延',
           '鉄骨製造', '製缶板金', '製剤', '製鋼', '製紙', '加工業', 'プレス製品',
           '刺しゅう', '伸鉄', '伸線', '製糸', 'かじ業', '製氷', '製薪炭',
           '精製業', '製鉄業', '鉄鋼業', '粉砕', 'シャースリット',
           '金属彫刻', '金属熱処理', '金属製品塗装', '金属表面処理',
           'プラスチック製品', '金属製品', '繊維製品']
    for kw in mfg:
        if kw in name:
            return 'E 製造業'
    if 'と畜場' in name:
        return 'E 製造業'
    return None


# Read and combine all files
all_dfs = []
for fname, col in files_config:
    df = read_file(fname, col)
    all_dfs.append(df)

combined = pd.concat(all_dfs, ignore_index=True)
print(f"\nTotal rows before dedup: {len(combined):,}")

# Dedup by tsr_id (keep first occurrence which has more data typically)
has_tsr = combined['tsr_id'].notna()
deduped_tsr = combined[has_tsr].drop_duplicates(subset='tsr_id', keep='first')
no_tsr = combined[~has_tsr]
combined = pd.concat([deduped_tsr, no_tsr], ignore_index=True)
print(f"After dedup by tsr_id: {len(combined):,}")

# Apply 大分類
print("Applying industry_major classification...")
combined['industry_major'] = combined['industry_sub'].apply(classify_major)

# Clean up numeric columns
for col in ['revenue_k', 'net_income_k', 'ordinary_income_k', 'capital_k']:
    combined[col] = combined[col].where(combined[col].notna(), None)

for col in ['established_year', 'representative_age', 'employee_count']:
    combined[col] = pd.to_numeric(combined[col], errors='coerce')
    combined[col] = combined[col].where(combined[col].notna(), None)

# Convert phone to string, clean
combined['phone'] = combined['phone'].apply(lambda v: str(v).strip() if pd.notna(v) else None)

# Remove rows without company name
combined = combined[combined['company_name'].notna()]
print(f"Final row count: {len(combined):,}")

# Output CSV
columns_order = [
    'company_name', 'business_description', 'postal_code', 'prefecture',
    'city', 'address', 'full_address', 'revenue_k', 'net_income_k',
    'ordinary_income_k', 'capital_k', 'established_year', 'representative',
    'representative_age', 'employee_count', 'industry_major', 'industry_sub',
    'phone', 'tsr_id', 'remarks', 'source_file', 'shareholders', 'officers'
]
combined[columns_order].to_csv(OUTPUT_CSV, index=False, encoding='utf-8-sig')
print(f"\nExported to: {OUTPUT_CSV}")
print(f"File size: {os.path.getsize(OUTPUT_CSV) / 1024 / 1024:.1f} MB")
