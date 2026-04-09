-- 株主分類v4: known_corporate_shareholdersテーブル + 精度向上
-- キーワードマッチ名: 3社以上100%出資で法人認定
-- キーワード非マッチ短名: 10社以上で法人認定（同姓同名リスク回避）

CREATE TABLE IF NOT EXISTS known_corporate_shareholders (
  name TEXT PRIMARY KEY
);

TRUNCATE known_corporate_shareholders;

-- 1) キーワードマッチ名 → 3社以上
INSERT INTO known_corporate_shareholders (name)
SELECT name FROM (
  SELECT split_part(shareholders, '（', 1) as name, count(*) as cnt
  FROM company_master
  WHERE shareholders LIKE '%（１００％）' AND shareholders NOT LIKE '%，%'
  GROUP BY 1 HAVING count(*) >= 3
) sub
WHERE name ~ '[ァ-ヴー]|[Ａ-Ｚ]|工|業|産|商|社|建|電|製|鉄|化|運|通|物|銀|証|保|倉|鋼|石|機|薬|材|林|船|港|鉱|農|食|乳|酒|造|報|放|信|送|装|園|殖|道|空|警|環|瓦|紡|陶|窯|合|光|精|碍|水|誘|銘|急|冷|硬|流|油|肥|飼|管|測|牧|金庫|組合|法人|協会|公社|機構|出版|不動|百貨|繊維|セメント|興|販|醸|鋳|硝子'
ON CONFLICT DO NOTHING;

-- 2) キーワード非マッチ名 → 10社以上
INSERT INTO known_corporate_shareholders (name)
SELECT name FROM (
  SELECT split_part(shareholders, '（', 1) as name, count(*) as cnt
  FROM company_master
  WHERE shareholders LIKE '%（１００％）' AND shareholders NOT LIKE '%，%'
  GROUP BY 1 HAVING count(*) >= 10
) sub
WHERE name !~ '[ァ-ヴー]|[Ａ-Ｚ]|工|業|産|商|社|建|電|製|鉄|化|運|通|物|銀|証|保|倉|鋼|石|機|薬|材|林|船|港|鉱|農|食|乳|酒|造|報|放|信|送|装|園|殖|道|空|警|環|瓦|紡|陶|窯|合|光|精|碍|水|誘|銘|急|冷|硬|流|油|肥|飼|管|測|牧|金庫|組合|法人|協会|公社|機構|出版|不動|百貨|繊維|セメント|興|販|醸|鋳|硝子'
ON CONFLICT DO NOTHING;

DELETE FROM known_corporate_shareholders WHERE name IN ('自己株式', '一般個人', '山本哲也');

CREATE INDEX IF NOT EXISTS idx_known_corp_name ON known_corporate_shareholders(name);

-- 分類関数: キーワード + known_corporate_shareholdersテーブル参照
CREATE OR REPLACE FUNCTION classify_shareholder_type(shareholders TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  corp_pattern TEXT := '[ァ-ヴー]{3}|[Ａ-Ｚａ-ｚ]|株式会社|有限会社|合同会社|合資会社|持株会|組合|信用金庫|社団法人|財団法人|協会|公社|機構|工業|産業|商事|物流|運輸|建設|製作所|ホールディングス|グループ|出版|不動産|電気|電機|化学|製薬|食品|印刷|通運|海運|倉庫|鉄道|電力|証券|保険|銀行|金属|鋼|セメント|紡績|繊維|石油|投資育成|自動車|百貨店|機械|製造|事務所|研究所|水産|薬品|塗料|樹脂|興業|販売|醸造|鋳造|・|物産|商会|商店|実業|企画|開発|設計|観光|交通|汽船|航空|放送|通信|情報|土木|住宅|地所|事業|管理|配送|急便|酒造|乳業|木材|園芸|養殖|都市|鋼管|電線|測量|学園|新聞|牧場|農園|薬局|書店|出資|合名|内装|家具|飼料|肥料|油脂|光学|精密|計器|硬質|鍛造|製鉄|製紙|製菓|製綱|製氷|製鋼|製パン|警備|保障|農業|道路|高速|環境|織機|瓦斯|通商|電工|電鉄|林業|郵船|商船|興産|急行|工務店|鉱業|鉱油|食料|建機|合成|鉄工|造船|建物|電信|精工|精機|空港|流通|誘電|碍子|信号|銘板|化薬|水道|殖産|冷蔵|化成|ゴム|バス|ハム|ガス|紡|陶|窯';
  has_corp BOOLEAN;
  has_individual BOOLEAN := FALSE;
  parts TEXT[];
  p TEXT;
  name_part TEXT;
  known_count INT;
BEGIN
  IF shareholders IS NULL THEN RETURN 'empty'; END IF;

  has_corp := shareholders ~ corp_pattern;

  IF NOT has_corp THEN
    SELECT count(*) INTO known_count
    FROM unnest(string_to_array(shareholders, '，')) sp
    JOIN known_corporate_shareholders kc ON kc.name = split_part(sp, '（', 1);
    IF known_count > 0 THEN has_corp := TRUE; END IF;
  END IF;

  IF NOT has_corp THEN RETURN 'individual'; END IF;

  parts := string_to_array(shareholders, '，');
  FOREACH p IN ARRAY parts LOOP
    name_part := split_part(p, '（', 1);
    IF name_part !~ corp_pattern
       AND NOT EXISTS (SELECT 1 FROM known_corporate_shareholders WHERE name = name_part)
       AND length(name_part) <= 6
    THEN
      has_individual := TRUE;
      EXIT;
    END IF;
  END LOOP;

  IF has_individual THEN RETURN 'mixed'; ELSE RETURN 'corporate'; END IF;
END;
$$;
