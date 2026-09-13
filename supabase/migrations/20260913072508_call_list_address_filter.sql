-- Match the browser's companyAddressMatch.js rules without transferring every memo.
-- These functions only read their arguments; imported addresses remain unchanged.
CREATE OR REPLACE FUNCTION public.normalize_call_company_address(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = '' AS $$
DECLARE
  v text;
  m text[];
  c text;
  n numeric;
  digit integer;
  unit integer;
BEGIN
  v := regexp_replace(normalize(coalesce(p_value, ''), NFKC), '^\s+|\s+$', '', 'g');
  IF v = '' OR v ~* '^(?:[-ー―—–−/・*＊?？]+|不明|未確認|未取得|未登録|未記入|記載なし|情報なし|住所不明|非公開|なし|無し|null|undefined|n/?a)$' THEN RETURN ''; END IF;
  v := regexp_replace(v, '^(?:〒\s*)?[0-9]{3}[-‐‑‒–—―−ー]?[0-9]{4}\s*(?=(?:北海道|東京都|京都府|大阪府|.{2,3}県))', '');
  v := regexp_replace(v, '\s+', '', 'g');
  v := regexp_replace(v, '/+$', '');
  FOR m IN SELECT regexp_matches(v, '[〇零一二三四五六七八九十百千]+(?=丁目|番地|番(?!町)|号(?!館|棟|室))', 'g') LOOP
    IF m[1] !~ '[十百千]' THEN
      n := translate(m[1], '〇零一二三四五六七八九', '00123456789')::numeric;
    ELSE
      n := 0; digit := 0;
      FOR c IN SELECT regexp_split_to_table(m[1], '') LOOP
        unit := CASE c WHEN '十' THEN 10 WHEN '百' THEN 100 WHEN '千' THEN 1000 ELSE 0 END;
        IF unit > 0 THEN n := n + coalesce(nullif(digit, 0), 1) * unit; digit := 0;
        ELSE digit := translate(c, '〇零一二三四五六七八九', '00123456789')::integer; END IF;
      END LOOP;
      n := n + digit;
    END IF;
    v := regexp_replace(v, m[1] || '(?=丁目|番地|番(?!町)|号(?!館|棟|室))', n::text);
  END LOOP;
  v := regexp_replace(v, '([0-9])[‐‑‒–—―−ー](?=[0-9])', '\1-', 'g');
  v := regexp_replace(v, '([0-9])(?:丁目|番地の|番地|番|号の|の)(?=[0-9])', '\1-', 'g');
  RETURN lower(regexp_replace(v, '([0-9])(?:番地|番|号)(?=$|[^0-9室館棟町])', '\1', 'g'));
END;
$$;

CREATE OR REPLACE FUNCTION public.is_comparable_call_address(p_address text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = '' AS $$
  SELECT coalesce(
    p_address ~ '^(北海道|東京都|京都府|大阪府|.{2,3}県)'
    AND regexp_replace(p_address, '^(北海道|東京都|京都府|大阪府|.{2,3}県)', '') ~ '[0-9]|無番地|番地なし'
    AND p_address !~ '(丁目|市|区|町|村)$'
    AND p_address !~ '[*＊●○?？]|以下不明|番地不明|一部非公開', false);
$$;

CREATE OR REPLACE FUNCTION public.call_list_address_match(p_address text, p_memo text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = '' AS $$
DECLARE
  company_address text := public.normalize_call_company_address(p_address);
  memo_data jsonb;
  entry record;
  candidate text;
  home_address text;
BEGIN
  IF NOT public.is_comparable_call_address(company_address) THEN RETURN 'unknown'; END IF;
  BEGIN memo_data := p_memo::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN RETURN 'unknown'; END;
  IF jsonb_typeof(memo_data) IS DISTINCT FROM 'object' THEN RETURN 'unknown'; END IF;
  FOR entry IN SELECT key, value FROM jsonb_each(memo_data) LOOP
    IF lower(regexp_replace(normalize(entry.key, NFKC), '[\s()（）]', '', 'g')) = ANY (ARRAY[
      '代表者自宅住所', '代表者現住所', '代表者現住所詳細', '代表者住所詳細', '代表者住所',
      '代表者居住地', '社長自宅住所', '社長住所', '自宅住所',
      'representative_address', 'representative_home_address', 'president_address'
    ]) AND jsonb_typeof(entry.value) = 'string' THEN
      candidate := public.normalize_call_company_address(entry.value #>> '{}');
      IF public.is_comparable_call_address(candidate) THEN
        IF home_address IS NOT NULL AND home_address <> candidate THEN RETURN 'unknown'; END IF;
        home_address := candidate;
      END IF;
    END IF;
  END LOOP;
  IF home_address IS NULL THEN RETURN 'unknown'; END IF;
  RETURN CASE WHEN company_address = home_address THEN 'same' ELSE 'different' END;
END;
$$;

-- PostgREST computed field: available for filtering, omitted from select('*').
-- Unnamed row argument prevents exposing this as a standalone RPC.
CREATE OR REPLACE FUNCTION public.company_address_match(public.call_list_items)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = '' AS $$
  SELECT public.call_list_address_match($1.address, $1.memo);
$$;

-- One small response for the detail modal, instead of downloading all companies.
CREATE OR REPLACE FUNCTION public.call_list_filter_summary(p_list_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = '' AS $$
  SELECT jsonb_build_object('count', count(*), 'prefectures', coalesce(
    jsonb_agg(DISTINCT substring(i.address FROM '^(北海道|東京都|京都府|大阪府|.{2,3}県)'))
      FILTER (WHERE i.address ~ '^(北海道|東京都|京都府|大阪府|.{2,3}県)'), '[]'::jsonb))
  FROM public.call_list_items i WHERE i.list_id = p_list_id;
$$;

REVOKE ALL ON FUNCTION public.normalize_call_company_address(text), public.is_comparable_call_address(text),
  public.call_list_address_match(text,text), public.company_address_match(public.call_list_items),
  public.call_list_filter_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_call_company_address(text), public.is_comparable_call_address(text),
  public.call_list_address_match(text,text), public.company_address_match(public.call_list_items),
  public.call_list_filter_summary(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
