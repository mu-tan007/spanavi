-- Organization-private company directory. Original enterprise/list rows remain
-- intact; a company ID links their facts and activity without exposing client data.
CREATE TABLE public.company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
  company_name text NOT NULL, representative text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '', business text NOT NULL DEFAULT '', industry text NOT NULL DEFAULT '',
  corporate_number text, representative_address text, home_key text NOT NULL DEFAULT '',
  home_representative_key text NOT NULL DEFAULT '',
  home_state text NOT NULL DEFAULT 'unknown' CHECK(home_state IN ('unknown','available','conflict')),
  home_source jsonb NOT NULL DEFAULT '{}', overrides jsonb NOT NULL DEFAULT '{}',
  needs_review boolean NOT NULL DEFAULT false,
  master_count integer NOT NULL DEFAULT 0, list_count integer NOT NULL DEFAULT 0, source_count integer NOT NULL DEFAULT 0,
  crm_stage text NOT NULL DEFAULT '未設定' CHECK(crm_stage IN ('未設定','未接触','接触中','再連絡予定','商談中','取引あり','対象外')),
  owner_name text NOT NULL DEFAULT '', next_action_at timestamptz, next_action_note text NOT NULL DEFAULT '',
  shared_memo text NOT NULL DEFAULT '',
  registry_status text NOT NULL DEFAULT 'unknown' CHECK(registry_status IN ('unknown','active','closed')),
  registry_source text NOT NULL DEFAULT '', registry_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE(org_id,id),
  CHECK(corporate_number IS NULL OR corporate_number ~ '^[1-9][0-9]{12}$'),
  CHECK(registry_status='unknown' OR (registry_source<>'' AND registry_checked_at IS NOT NULL))
);
CREATE TABLE public.company_profile_links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL, company_id uuid NOT NULL,
  master_id bigint REFERENCES public.company_master(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.call_list_items(id) ON DELETE CASCADE,
  list_id uuid REFERENCES public.call_lists(id) ON DELETE CASCADE, sort_no integer,
  name_key text NOT NULL DEFAULT '', representative_key text NOT NULL DEFAULT '',
  phone_key text NOT NULL DEFAULT '', address_key text NOT NULL DEFAULT '', corporate_number text,
  legal_form text NOT NULL DEFAULT '', source_data jsonb NOT NULL DEFAULT '{}',
  local_home_key text NOT NULL DEFAULT '', local_home_state text NOT NULL DEFAULT 'unknown'
    CHECK(local_home_state IN ('unknown','available','conflict')),
  address_match text NOT NULL DEFAULT 'unknown' CHECK(address_match IN ('same','different','unknown')),
  link_reason text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(org_id,company_id) REFERENCES public.company_profiles(org_id,id),
  CHECK((master_id IS NOT NULL AND item_id IS NULL AND list_id IS NULL)
    OR (master_id IS NULL AND item_id IS NOT NULL AND list_id IS NOT NULL)),
  UNIQUE(org_id,master_id), UNIQUE(item_id)
);
CREATE TABLE public.company_profile_facts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id uuid NOT NULL, company_id uuid NOT NULL,
  source_key text NOT NULL, field text NOT NULL CHECK(field IN ('representative_address','corporate_number')),
  value text NOT NULL, normalized_value text NOT NULL DEFAULT '', representative_key text NOT NULL DEFAULT '',
  source jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(org_id,company_id) REFERENCES public.company_profiles(org_id,id),
  UNIQUE(org_id,source_key)
);
CREATE TABLE public.company_profile_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id uuid NOT NULL, company_id uuid NOT NULL,
  actor_id uuid, event_type text NOT NULL, changes jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(org_id,company_id) REFERENCES public.company_profiles(org_id,id)
);
CREATE TABLE public.company_profile_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
  reason text NOT NULL, company_ids jsonb NOT NULL, source_count integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','separate')),
  note text NOT NULL DEFAULT '', resolved_by uuid, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
-- Only organizations explicitly initialized by the backfill receive global DB
-- source updates. Their private target-company directory stays isolated.
CREATE TABLE public.company_profile_sync_orgs (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id), enabled boolean NOT NULL DEFAULT false,
  initialized_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX company_profiles_org_name ON public.company_profiles(org_id,company_name,id);
CREATE INDEX company_profiles_org_stage ON public.company_profiles(org_id,crm_stage,company_name,id);
CREATE INDEX company_profiles_org_next ON public.company_profiles(org_id,next_action_at,id) WHERE next_action_at IS NOT NULL;
CREATE INDEX company_profiles_org_corp ON public.company_profiles(org_id,corporate_number) WHERE corporate_number IS NOT NULL;
CREATE INDEX company_profiles_org_home ON public.company_profiles(org_id,home_state);
CREATE INDEX company_profiles_org_review ON public.company_profiles(org_id,company_name,id) WHERE needs_review;
CREATE INDEX company_profile_links_company ON public.company_profile_links(org_id,company_id);
CREATE INDEX company_profile_links_master ON public.company_profile_links(master_id) WHERE master_id IS NOT NULL;
CREATE INDEX company_profile_links_list_match ON public.company_profile_links(org_id,list_id,address_match,sort_no,item_id) WHERE item_id IS NOT NULL;
CREATE INDEX company_profile_links_name_phone ON public.company_profile_links(org_id,name_key,phone_key) WHERE name_key<>'' AND phone_key<>'';
CREATE INDEX company_profile_links_name_rep ON public.company_profile_links(org_id,name_key,representative_key) WHERE name_key<>'' AND representative_key<>'';
CREATE INDEX company_profile_links_name_address ON public.company_profile_links(org_id,name_key,md5(address_key)) WHERE name_key<>'' AND address_key<>'';
CREATE INDEX company_profile_links_corp ON public.company_profile_links(org_id,corporate_number) WHERE corporate_number IS NOT NULL;
CREATE INDEX company_profile_facts_company ON public.company_profile_facts(org_id,company_id,field);
CREATE INDEX company_profile_events_company ON public.company_profile_events(org_id,company_id,created_at DESC);
CREATE INDEX company_profile_reviews_org ON public.company_profile_reviews(org_id,status);

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profile_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profile_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profile_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profile_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profile_sync_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_profiles_staff_read ON public.company_profiles FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
CREATE POLICY company_profile_links_staff_read ON public.company_profile_links FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
CREATE POLICY company_profile_facts_staff_read ON public.company_profile_facts FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
CREATE POLICY company_profile_events_staff_read ON public.company_profile_events FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
CREATE POLICY company_profile_reviews_staff_read ON public.company_profile_reviews FOR SELECT TO authenticated USING(org_id=(SELECT public.get_user_org_id()));
REVOKE ALL ON public.company_profiles,public.company_profile_links,public.company_profile_facts,
  public.company_profile_events,public.company_profile_reviews,public.company_profile_sync_orgs FROM anon,authenticated;
GRANT SELECT ON public.company_profiles,public.company_profile_links,public.company_profile_facts,
  public.company_profile_events,public.company_profile_reviews TO authenticated;

CREATE FUNCTION public.crm_identity_text(p text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  WITH v AS (SELECT lower(regexp_replace(normalize(coalesce(p,''),NFKC),'\s+','','g')) t)
  SELECT CASE WHEN t ~* '^(?:[-ー―/・*?]+|不明|なし|無し|未登録|未確認|未記入|非公開|null|undefined|n/?a|代表者|代表取締役|社長|個人)$' THEN '' ELSE t END FROM v;
$$;
CREATE FUNCTION public.crm_identity_name(p text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  SELECT regexp_replace(public.crm_identity_text(p),'株式会社|\(株\)|有限会社|\(有\)|合同会社|\(同\)|合資会社|\(資\)|合名会社|\(名\)|一般社団法人|一般財団法人|公益社団法人|公益財団法人|医療法人社団|医療法人|社会福祉法人|特定非営利活動法人|npo法人','','g');
$$;
CREATE FUNCTION public.crm_identity_representative(p text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  SELECT regexp_replace(public.crm_identity_text(p),'^(?:代表取締役社長|代表取締役|取締役社長|代表社員|代表者|社長)[:：]?','');
$$;
CREATE FUNCTION public.crm_identity_phone(p text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  WITH v AS (SELECT regexp_replace(regexp_replace(public.crm_identity_text(p),'^\+81(?:\(0\))?','0'),'[-()‐‑‒–—―−ー]','','g') t)
  SELECT CASE WHEN t ~ '^0[0-9]{9,10}$' AND t !~ '^0{5}' THEN t ELSE '' END FROM v;
$$;
CREATE FUNCTION public.crm_identity_address(p text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  WITH v AS (SELECT public.normalize_call_company_address(regexp_replace(normalize(coalesce(p,''),NFKC),
    '^(?:〒\s*)?[0-9]{3}[-‐‑‒–—―−ー]?[0-9]{4}[\s_]*(?=(?:北海道|東京都|京都府|大阪府|.{2,3}県))','')) t)
  SELECT CASE WHEN public.is_comparable_call_address(t) THEN t ELSE '' END FROM v;
$$;
CREATE FUNCTION public.crm_corporate_number(p text) RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
DECLARE v text := replace(public.crm_identity_text(p),'-',''); s integer:=0; j integer;
BEGIN
  IF v !~ '^[1-9][0-9]{12}$' THEN RETURN NULL; END IF;
  FOR j IN 1..12 LOOP s:=s+substring(v,14-j,1)::integer * CASE WHEN j%2=0 THEN 2 ELSE 1 END; END LOOP;
  RETURN CASE WHEN substring(v,1,1)::integer=9-s%9 THEN v ELSE NULL END;
END; $$;
CREATE FUNCTION public.crm_legal_form(p text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  SELECT CASE
    WHEN normalize(coalesce(p,''),NFKC) ~ '株式会社|\(株\)' THEN '株式会社'
    WHEN normalize(coalesce(p,''),NFKC) ~ '有限会社|\(有\)' THEN '有限会社'
    WHEN normalize(coalesce(p,''),NFKC) ~ '合同会社|\(同\)' THEN '合同会社'
    WHEN normalize(coalesce(p,''),NFKC) ~ '合資会社|\(資\)' THEN '合資会社'
    WHEN normalize(coalesce(p,''),NFKC) ~ '合名会社|\(名\)' THEN '合名会社'
    ELSE coalesce(substring(normalize(coalesce(p,''),NFKC) FROM '(一般社団法人|一般財団法人|公益社団法人|公益財団法人|医療法人|社会福祉法人|特定非営利活動法人)'),
      CASE WHEN p ~* 'NPO法人' THEN '特定非営利活動法人' ELSE '' END) END;
$$;
CREATE FUNCTION public.crm_require_org() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE insufficient_privilege USING MESSAGE='Authentication required'; END IF;
  v:=public.get_user_org_id();
  IF v IS NULL THEN RAISE insufficient_privilege USING MESSAGE='Organization membership required'; END IF;
  RETURN v;
END; $$;

REVOKE ALL ON FUNCTION public.crm_identity_text(text),public.crm_identity_name(text),public.crm_identity_representative(text),
  public.crm_identity_phone(text),public.crm_identity_address(text),public.crm_corporate_number(text),public.crm_legal_form(text),
  public.crm_require_org() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
