-- 企業DBの検索専用の細い表（2026-10-06）。
-- DBのメモリ（キャッシュ256MB）に対し、検索で読む company_profiles（356MB）と company_directory_search（600MB）が大きく、
-- 冷えている時に読み直しで時間切れになっていた。絞り込み・件数・並べ替えに要る列だけを、正規化済みで持つ。
-- 中身は crm_refresh_directory（会社の更新のたびに走る）で投影表と同時に作り直す。投影表と同じく「有効な会社だけ」。
SET LOCAL lock_timeout='4s';
CREATE TABLE IF NOT EXISTS public.company_directory_lite (
 company_id uuid PRIMARY KEY REFERENCES public.company_profiles(id) ON DELETE CASCADE,
 org_id uuid NOT NULL,
 company_name text NOT NULL,          -- 並べ替え用（元の表記のまま）
 name_n text NOT NULL, rep_n text NOT NULL, phone_n text NOT NULL, corp_n text NOT NULL,
 addr_n text NOT NULL, industry_n text NOT NULL, business_n text NOT NULL, owner_n text NOT NULL,
 prefecture text, industry_major text, industry_sub text, shareholder_type text, address_match text,
 rep_shareholder_match boolean, phone_key text,
 revenue_k numeric, net_income_k numeric, ordinary_income_k numeric, capital_k numeric,
 employee_count numeric, representative_age numeric, established_year numeric,
 crm_stage text, home_state text, registry_status text, needs_review boolean, next_action_at timestamptz
);
ALTER TABLE public.company_directory_lite ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_directory_lite FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS company_directory_lite_org ON public.company_directory_lite(org_id);

CREATE OR REPLACE FUNCTION public.crm_directory_lite_refresh(p_ids uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO public.company_directory_lite AS x
 SELECT p.id,p.org_id,p.company_name,
  lower(normalize(coalesce(p.company_name,''),NFKC)),lower(normalize(coalesce(p.representative,''),NFKC)),
  lower(normalize(coalesce(p.phone,''),NFKC)),lower(normalize(coalesce(p.corporate_number,''),NFKC)),
  lower(normalize(coalesce(p.address,''),NFKC)),lower(normalize(coalesce(p.industry,''),NFKC)),
  lower(normalize(coalesce(p.business,''),NFKC)),lower(normalize(coalesce(p.owner_name,''),NFKC)),
  d.prefecture,d.values->>'industry_major',d.values->>'industry_sub',d.shareholder_type,d.address_match,
  d.rep_shareholder_match,d.phone_key,
  d.revenue_k,d.net_income_k,d.ordinary_income_k,d.capital_k,d.employee_count,d.representative_age,d.established_year,
  p.crm_stage,p.home_state,p.registry_status,p.needs_review,p.next_action_at
 FROM public.company_profiles p JOIN public.company_directory_search d ON d.company_id=p.id AND d.org_id=p.org_id
 WHERE p.id=ANY(p_ids) AND p.source_count>0 AND p.merged_into IS NULL
 ON CONFLICT (company_id) DO UPDATE SET org_id=EXCLUDED.org_id,company_name=EXCLUDED.company_name,
  name_n=EXCLUDED.name_n,rep_n=EXCLUDED.rep_n,phone_n=EXCLUDED.phone_n,corp_n=EXCLUDED.corp_n,addr_n=EXCLUDED.addr_n,
  industry_n=EXCLUDED.industry_n,business_n=EXCLUDED.business_n,owner_n=EXCLUDED.owner_n,
  prefecture=EXCLUDED.prefecture,industry_major=EXCLUDED.industry_major,industry_sub=EXCLUDED.industry_sub,
  shareholder_type=EXCLUDED.shareholder_type,address_match=EXCLUDED.address_match,
  rep_shareholder_match=EXCLUDED.rep_shareholder_match,phone_key=EXCLUDED.phone_key,
  revenue_k=EXCLUDED.revenue_k,net_income_k=EXCLUDED.net_income_k,ordinary_income_k=EXCLUDED.ordinary_income_k,
  capital_k=EXCLUDED.capital_k,employee_count=EXCLUDED.employee_count,representative_age=EXCLUDED.representative_age,
  established_year=EXCLUDED.established_year,crm_stage=EXCLUDED.crm_stage,home_state=EXCLUDED.home_state,
  registry_status=EXCLUDED.registry_status,needs_review=EXCLUDED.needs_review,next_action_at=EXCLUDED.next_action_at;
 DELETE FROM public.company_directory_lite x WHERE x.company_id=ANY(p_ids)
  AND NOT EXISTS (SELECT 1 FROM public.company_directory_search d WHERE d.company_id=x.company_id);
END; $function$;
REVOKE ALL ON FUNCTION public.crm_directory_lite_refresh(uuid[]) FROM public, anon, authenticated;

-- 投影表を作り直した直後に、細い表も作り直す
DO $do$
DECLARE src text; old text:=$o$ WHERE d.company_id=p.id AND p.id=ANY(p_ids) AND (p.source_count=0 OR p.merged_into IS NOT NULL);
END;$o$;
BEGIN
 src:=pg_get_functiondef('public.crm_refresh_directory(uuid[])'::regprocedure);
 IF position('crm_directory_lite_refresh' in src)>0 THEN RETURN; END IF;
 IF position(old in src)=0 THEN RAISE EXCEPTION 'crm_refresh_directory: target not found'; END IF;
 src:=replace(src,old,$n$ WHERE d.company_id=p.id AND p.id=ANY(p_ids) AND (p.source_count=0 OR p.merged_into IS NOT NULL);
 PERFORM public.crm_directory_lite_refresh(p_ids);
END;$n$);
 EXECUTE src;
END $do$;
