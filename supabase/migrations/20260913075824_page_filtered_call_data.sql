-- RLS security barriers prevent using the computed-field predicate as an index
-- condition. Check the same staff org boundary once, then use the expression index.
-- Page companies and their histories together to keep large lists below API timeouts.
DROP FUNCTION public.call_list_filtered_data(uuid,text,integer,integer);
CREATE FUNCTION public.call_list_filtered_data(
  p_list_id uuid, p_address_match text DEFAULT '', p_start_no integer DEFAULT NULL, p_end_no integer DEFAULT NULL,
  p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000, p_include_count boolean DEFAULT true
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
    RETURN jsonb_build_object('items', '[]'::jsonb, 'records', '[]'::jsonb, 'count', 0);
  END IF;
  -- Parameterized EXECUTE replans for the selected list/filter on each request.
  -- A cached generic plan would lose the indexed path for selective filters.
  EXECUTE $query$
    WITH matched AS NOT MATERIALIZED (
      SELECT i.* FROM public.call_list_items i
      WHERE i.org_id = $1 AND i.list_id = $2
        AND ($3 = '' OR public.company_address_match(i) = $3)
        AND ($4 IS NULL OR i.no >= $4) AND ($5 IS NULL OR i.no <= $5)
    ), selected AS MATERIALIZED (
      SELECT * FROM matched ORDER BY no LIMIT $6 OFFSET $7
    ), records AS (
      SELECT r.* FROM public.call_records r JOIN selected i ON i.id = r.item_id
      WHERE r.org_id = $1 AND r.list_id = $2
    )
    SELECT jsonb_build_object(
      'count', CASE WHEN $8 THEN (SELECT count(*) FROM matched) ELSE NULL END,
      'items', coalesce((SELECT jsonb_agg(i ORDER BY i.no) FROM selected i), '[]'::jsonb),
      'records', coalesce((SELECT jsonb_agg(r ORDER BY r.round, r.id) FROM records r), '[]'::jsonb)
    )
  $query$ INTO v_result USING v_org, p_list_id, v_match, p_start_no, p_end_no,
    greatest(1, least(coalesce(p_limit, 1000), 1000)), greatest(coalesce(p_offset, 0), 0), coalesce(p_include_count, true);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.call_list_filtered_data(uuid,text,integer,integer,integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_list_filtered_data(uuid,text,integer,integer,integer,integer,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
