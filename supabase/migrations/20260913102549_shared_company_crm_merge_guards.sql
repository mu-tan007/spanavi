CREATE OR REPLACE FUNCTION public.merge_company_profile_review(p_review_id uuid,p_keep_company_id uuid,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.crm_require_org(); r public.company_profile_reviews; keep public.company_profiles; other public.company_profiles;
  ids uuid[]; numbers integer;
BEGIN
  IF length(trim(coalesce(p_note,'')))<2 THEN RAISE invalid_parameter_value USING MESSAGE='同一企業と判断した根拠を入力してください'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(o::text,871));
  SELECT * INTO r FROM public.company_profile_reviews WHERE id=p_review_id AND org_id=o AND status='pending' FOR UPDATE;
  IF r.id IS NULL OR NOT r.company_ids @> to_jsonb(ARRAY[p_keep_company_id::text]) THEN
    RAISE no_data_found USING MESSAGE='確認対象が見つかりません'; END IF;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(r.company_ids);
  PERFORM 1 FROM public.company_profiles WHERE org_id=o AND id=ANY(ids) ORDER BY id FOR UPDATE;
  SELECT * INTO keep FROM public.company_profiles WHERE org_id=o AND id=p_keep_company_id AND merged_into IS NULL;
  IF keep.id IS NULL THEN RAISE serialization_failure USING MESSAGE='名寄せ状態が変わりました。再読み込みしてください'; END IF;
  IF EXISTS(SELECT 1 FROM public.company_profiles WHERE org_id=o AND id=ANY(ids) AND merged_into IS NOT NULL) THEN
    RAISE serialization_failure USING MESSAGE='確認対象の名寄せ状態が変わりました。再読み込みしてください'; END IF;
  -- A conflicted profile may have NULL corporate_number. Check its underlying
  -- numbers too; only an explicitly confirmed, valid override supersedes them.
  SELECT count(DISTINCT n) INTO numbers FROM (
    SELECT coalesce(nullif(p.overrides->>'corporate_number',''),p.corporate_number) n
      FROM public.company_profiles p WHERE p.org_id=o AND p.id=ANY(ids)
    UNION ALL SELECT l.corporate_number FROM public.company_profile_links l
      JOIN public.company_profiles p ON p.org_id=l.org_id AND p.id=l.company_id
      WHERE l.org_id=o AND l.company_id=ANY(ids) AND nullif(p.overrides->>'corporate_number','') IS NULL
    UNION ALL SELECT f.normalized_value FROM public.company_profile_facts f
      JOIN public.company_profiles p ON p.org_id=f.org_id AND p.id=f.company_id
      WHERE f.org_id=o AND f.company_id=ANY(ids) AND f.field='corporate_number' AND f.is_current
        AND f.normalized_value<>'' AND nullif(p.overrides->>'corporate_number','') IS NULL
  ) corporate_evidence WHERE n IS NOT NULL;
  IF numbers>1 THEN RAISE invalid_parameter_value USING MESSAGE='法人番号が異なるため統合できません。正しい番号と出典を確認してください'; END IF;
  FOR other IN SELECT * FROM public.company_profiles WHERE org_id=o AND id=ANY(ids) AND id<>keep.id AND merged_into IS NULL LOOP
    -- Keep every source and event. The previous profile survives as a redirect,
    -- and its manual choices are retained in the merge audit event.
    UPDATE public.company_profile_links SET company_id=keep.id,link_reason='利用者が同一企業と確認',updated_at=now() WHERE org_id=o AND company_id=other.id;
    UPDATE public.company_profile_facts SET company_id=keep.id WHERE org_id=o AND company_id=other.id;
    UPDATE public.company_profile_events SET company_id=keep.id WHERE org_id=o AND company_id=other.id;
    IF other.overrides ? 'representative_address' AND other.home_key<>'' THEN
      INSERT INTO public.company_profile_facts(org_id,company_id,source_key,field,value,normalized_value,representative_key,source)
        VALUES(o,keep.id,'merged:'||other.id||':home','representative_address',other.representative_address,other.home_key,other.home_representative_key,
          jsonb_build_object('kind','manual','label','統合前の企業カルテ','company_id',other.id)) ON CONFLICT(org_id,source_key) DO NOTHING;
    END IF;
    INSERT INTO public.company_profile_events(org_id,company_id,actor_id,event_type,changes)
      VALUES(o,keep.id,auth.uid(),'company_merged',jsonb_build_object('review_id',r.id,'note',p_note,'previous_profile',to_jsonb(other)-'search_text'));
    UPDATE public.company_profiles SET merged_into=keep.id,source_count=0,master_count=0,list_count=0,version=version+1,updated_at=now()
      WHERE org_id=o AND id=other.id;
    UPDATE public.company_profiles SET merged_into=keep.id WHERE org_id=o AND merged_into=other.id;
  END LOOP;
  UPDATE public.company_profile_reviews SET status='merged',note=p_note,resolved_by=auth.uid(),resolved_at=now() WHERE id=r.id AND org_id=o;
  PERFORM public.crm_refresh_company(keep.id);
  RETURN public.get_company_profile(keep.id);
END; $$;
