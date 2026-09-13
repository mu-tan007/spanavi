-- RLS security barriers prevent using the computed-field predicate as an index
-- condition. Check the same staff org boundary once, then use the expression index.
-- Return one consistent snapshot; never transfer unrelated companies or histories.
CREATE OR REPLACE FUNCTION public.call_list_filtered_data(
  p_list_id uuid, p_address_match text DEFAULT '', p_start_no integer DEFAULT NULL, p_end_no integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_org uuid;
  v_result jsonb;
  v_match text := coalesce(p_address_match, '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Authentication required'; END IF;
  v_org := public.get_user_org_id();
  IF v_org IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Organization membership required'; END IF;
  IF v_match NOT IN ('', 'same', 'different', 'unknown') THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Invalid address match filter';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.call_lists WHERE id = p_list_id AND org_id = v_org) THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'records', '[]'::jsonb);
  END IF;
  -- Parameterized EXECUTE replans for the selected list/filter on each request.
  -- A cached generic plan would lose the indexed path for selective filters.
  EXECUTE $query$
    WITH selected AS MATERIALIZED (
      SELECT i.* FROM public.call_list_items i
      WHERE i.org_id = $1 AND i.list_id = $2
        AND ($3 = '' OR public.company_address_match(i) = $3)
        AND ($4 IS NULL OR i.no >= $4) AND ($5 IS NULL OR i.no <= $5)
    ), records AS (
      SELECT r.* FROM public.call_records r JOIN selected i ON i.id = r.item_id
      WHERE r.org_id = $1 AND r.list_id = $2
    )
    SELECT jsonb_build_object(
      'items', coalesce((SELECT jsonb_agg(i ORDER BY i.no) FROM selected i), '[]'::jsonb),
      'records', coalesce((SELECT jsonb_agg(r ORDER BY r.round, r.id) FROM records r), '[]'::jsonb)
    )
  $query$ INTO v_result USING v_org, p_list_id, v_match, p_start_no, p_end_no;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.call_list_filtered_data(uuid,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_list_filtered_data(uuid,text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_list_filter_summary(p_list_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE v_org uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Authentication required'; END IF;
  v_org := public.get_user_org_id();
  IF v_org IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Organization membership required'; END IF;
  SELECT jsonb_build_object('count', count(*), 'prefectures', coalesce(
    jsonb_agg(DISTINCT substring(i.address FROM '^(北海道|東京都|京都府|大阪府|.{2,3}県)'))
      FILTER (WHERE i.address ~ '^(北海道|東京都|京都府|大阪府|.{2,3}県)'), '[]'::jsonb))
  INTO v_result FROM public.call_list_items i
  WHERE i.list_id = p_list_id AND i.org_id = v_org
    AND EXISTS (SELECT 1 FROM public.call_lists l WHERE l.id = p_list_id AND l.org_id = v_org);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.call_list_filter_summary(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.call_list_filter_summary(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
