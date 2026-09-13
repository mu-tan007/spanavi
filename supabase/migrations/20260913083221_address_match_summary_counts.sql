-- Keep list-wide coverage visible so missing home addresses are not mistaken for
-- a confirmed absence of matching companies. Reuse selective expression indexes.
CREATE OR REPLACE FUNCTION public.call_list_filter_summary(p_list_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE v_org uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Authentication required'; END IF;
  v_org := public.get_user_org_id();
  IF v_org IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Organization membership required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.call_lists WHERE id = p_list_id AND org_id = v_org) THEN
    RETURN jsonb_build_object('count', 0, 'prefectures', '[]'::jsonb,
      'address_match', jsonb_build_object('same', 0, 'different', 0, 'unknown', 0));
  END IF;
  EXECUTE $query$
    WITH totals AS MATERIALIZED (
      SELECT count(*) AS total, coalesce(
        jsonb_agg(DISTINCT substring(i.address FROM '^(北海道|東京都|京都府|大阪府|.{2,3}県)'))
          FILTER (WHERE i.address ~ '^(北海道|東京都|京都府|大阪府|.{2,3}県)'), '[]'::jsonb) AS prefectures
      FROM public.call_list_items i WHERE i.list_id = $1 AND i.org_id = $2
    ), matches AS MATERIALIZED (
      SELECT
        (SELECT count(*) FROM public.call_list_items i
          WHERE i.list_id = $1 AND i.org_id = $2 AND public.company_address_match(i) = 'same') AS same,
        (SELECT count(*) FROM public.call_list_items i
          WHERE i.list_id = $1 AND i.org_id = $2 AND public.company_address_match(i) = 'different') AS different
    )
    SELECT jsonb_build_object('count', t.total, 'prefectures', t.prefectures,
      'address_match', jsonb_build_object('same', m.same, 'different', m.different,
        'unknown', t.total - m.same - m.different))
    FROM totals t CROSS JOIN matches m
  $query$ INTO v_result USING p_list_id, v_org;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.call_list_filter_summary(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.call_list_filter_summary(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
