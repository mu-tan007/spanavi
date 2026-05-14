-- ============================================================
-- 「社長」→「キーマン」全置換 migration
--   2026-05-15
--   - call_records.status の日本語ラベルを更新（59,178 行）
--   - client_call_records.status を統一語彙へ
--   - appointments.ceo_ma_intent → keyman_ma_intent カラム rename
--   - org_settings.call_statuses JSONB のラベル＆フラグ名更新
--   - 11 RPC関数を CREATE OR REPLACE で keyman ラベル/カラム名に統一
-- ============================================================
set local search_path = public, extensions;

-- ──────────────────────────────────────────────────────────────
-- 1) call_records.status の日本語ラベル更新
-- ──────────────────────────────────────────────────────────────
UPDATE call_records SET status = 'キーマン再コール' WHERE status = '社長再コール';
UPDATE call_records SET status = 'キーマン断り'     WHERE status = '社長お断り';
UPDATE call_records SET status = 'キーマン不在'     WHERE status = '社長不在';

-- ──────────────────────────────────────────────────────────────
-- 2) client_call_records.status を統一語彙へ
--   旧 CRMLead ローカル STATUSES では 'absent' = 不通の意 だった。
--   既存3画面と統一して 'missed' に揃える。
-- ──────────────────────────────────────────────────────────────
UPDATE client_call_records SET status = 'missed' WHERE status = 'absent';
UPDATE client_call_records SET status = 'keyman_decline' WHERE status = 'rejected';

-- ──────────────────────────────────────────────────────────────
-- 3) appointments.ceo_ma_intent → keyman_ma_intent カラム rename
-- ──────────────────────────────────────────────────────────────
ALTER TABLE appointments RENAME COLUMN ceo_ma_intent TO keyman_ma_intent;

-- ──────────────────────────────────────────────────────────────
-- 4) org_settings.call_statuses JSONB の更新
--   ・ label "社長*" → "キーマン*"
--   ・ flag key  ceo_connect → keyman_connect
-- ──────────────────────────────────────────────────────────────
UPDATE org_settings
   SET setting_value = (
     SELECT jsonb_agg(
       jsonb_build_object(
         'id',     elem->>'id',
         'label',  CASE
                     WHEN (elem->>'label') = '社長再コール' THEN 'キーマン再コール'
                     WHEN (elem->>'label') = '社長お断り'   THEN 'キーマン断り'
                     WHEN (elem->>'label') = '社長不在'     THEN 'キーマン不在'
                     ELSE (elem->>'label')
                   END,
         'excluded',       COALESCE((elem->>'excluded')::boolean, false),
         'color',          elem->>'color',
         'bg',             elem->>'bg',
         'desc',           elem->>'desc',
         'keyman_connect', COALESCE((elem->>'ceo_connect')::boolean, (elem->>'keyman_connect')::boolean, false)
       )
       ORDER BY elem->>'id'
     )::text
     FROM jsonb_array_elements(setting_value::jsonb) AS elem
   )
 WHERE setting_key = 'call_statuses'
   AND setting_value IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- 5) RPC関数を CREATE OR REPLACE（11個）
-- ──────────────────────────────────────────────────────────────

-- 5.1) helper: _perf_ceo_connect_labels → _perf_keyman_connect_labels
DROP FUNCTION IF EXISTS public._perf_ceo_connect_labels();
CREATE OR REPLACE FUNCTION public._perf_keyman_connect_labels()
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
AS $$
DECLARE
  v_labels text[];
  v_raw text;
BEGIN
  SELECT setting_value INTO v_raw
  FROM public.org_settings
  WHERE org_id = public.get_user_org_id()
    AND setting_key = 'call_statuses';

  IF v_raw IS NOT NULL THEN
    SELECT array_agg(elem->>'label')
    INTO v_labels
    FROM jsonb_array_elements(v_raw::jsonb) AS elem
    WHERE (elem->>'keyman_connect')::boolean = true;
  END IF;

  IF v_labels IS NULL OR array_length(v_labels, 1) IS NULL THEN
    v_labels := ARRAY['キーマン再コール', 'アポ獲得', 'キーマン断り'];
  END IF;

  RETURN v_labels;
END;
$$;

-- 5.2) perf_activity_summary（戻り JSON の ceo_connect → keyman_connect）
CREATE OR REPLACE FUNCTION public.perf_activity_summary(
  p_from timestamptz, p_to timestamptz,
  p_prev_from timestamptz DEFAULT NULL,
  p_prev_to   timestamptz DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_cc text[] := public._perf_keyman_connect_labels();
  v_cur jsonb;
  v_prev jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total', count(*),
    'keyman_connect', count(*) FILTER (WHERE status = ANY(v_cc)),
    'appo', count(*) FILTER (WHERE status = 'アポ獲得')
  ) INTO v_cur
  FROM public.call_records
  WHERE org_id = v_org
    AND called_at >= p_from AND called_at <= p_to;

  IF p_prev_from IS NOT NULL AND p_prev_to IS NOT NULL THEN
    SELECT jsonb_build_object(
      'total', count(*),
      'keyman_connect', count(*) FILTER (WHERE status = ANY(v_cc)),
      'appo', count(*) FILTER (WHERE status = 'アポ獲得')
    ) INTO v_prev
    FROM public.call_records
    WHERE org_id = v_org
      AND called_at >= p_prev_from AND called_at <= p_prev_to;
  ELSE
    v_prev := '{"total":0,"keyman_connect":0,"appo":0}'::jsonb;
  END IF;

  RETURN jsonb_build_object('current', v_cur, 'previous', v_prev);
END;
$$;

-- 5.3) perf_hourly_chart（helper呼出のみ変更、戻りカラム名は元のまま）
CREATE OR REPLACE FUNCTION public.perf_hourly_chart(p_date date)
  RETURNS TABLE(hour integer, call_only integer, connect_only integer, appo integer)
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_cc text[] := public._perf_keyman_connect_labels();
  v_from timestamptz := (p_date::timestamp AT TIME ZONE 'Asia/Tokyo');
  v_to   timestamptz := ((p_date + 1)::timestamp AT TIME ZONE 'Asia/Tokyo');
BEGIN
  RETURN QUERY
  WITH hourly AS (
    SELECT
      EXTRACT(HOUR FROM called_at AT TIME ZONE 'Asia/Tokyo')::int AS h,
      count(*) AS total,
      count(*) FILTER (WHERE status = ANY(v_cc)) AS connect,
      count(*) FILTER (WHERE status = 'アポ獲得') AS appo_cnt
    FROM public.call_records
    WHERE org_id = v_org
      AND called_at >= v_from AND called_at < v_to
    GROUP BY h
  )
  SELECT
    h AS hour,
    (total - connect)::int AS call_only,
    (connect - appo_cnt)::int AS connect_only,
    appo_cnt::int AS appo
  FROM hourly
  ORDER BY h;
END;
$$;

-- 5.4) perf_ranking（戻りカラム ceo_connect → keyman_connect）
DROP FUNCTION IF EXISTS public.perf_ranking(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.perf_ranking(p_from timestamptz, p_to timestamptz)
  RETURNS TABLE(getter_name text, calls integer, keyman_connect integer, appo integer, work_hours numeric)
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_cc text[] := public._perf_keyman_connect_labels();
BEGIN
  RETURN QUERY
  WITH call_agg AS (
    SELECT
      cr.getter_name AS gn,
      count(*)::int AS cnt,
      count(*) FILTER (WHERE cr.status = ANY(v_cc))::int AS cc
    FROM public.call_records cr
    WHERE cr.org_id = v_org
      AND cr.called_at >= p_from AND cr.called_at <= p_to
      AND cr.getter_name IS NOT NULL
    GROUP BY cr.getter_name
  ),
  appo_agg AS (
    SELECT
      a.getter_name AS gn,
      count(*)::int AS cnt
    FROM public.appointments a
    WHERE a.org_id = v_org
      AND a.created_at >= p_from AND a.created_at <= p_to
      AND a.getter_name IS NOT NULL
    GROUP BY a.getter_name
  ),
  work_hours_agg AS (
    SELECT
      sub.gn,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (sub.day_max - sub.day_min)) / 3600.0
      )::numeric, 2) AS wh
    FROM (
      SELECT
        cr2.getter_name AS gn,
        (cr2.called_at AT TIME ZONE 'Asia/Tokyo')::date AS jst_date,
        MIN(cr2.called_at) AS day_min,
        MAX(cr2.called_at) AS day_max
      FROM public.call_records cr2
      WHERE cr2.org_id = v_org
        AND cr2.called_at >= p_from AND cr2.called_at <= p_to
        AND cr2.getter_name IS NOT NULL
      GROUP BY cr2.getter_name, (cr2.called_at AT TIME ZONE 'Asia/Tokyo')::date
    ) sub
    WHERE sub.day_max > sub.day_min
    GROUP BY sub.gn
  )
  SELECT
    COALESCE(c.gn, a.gn, w.gn)::text,
    COALESCE(c.cnt, 0)::int,
    COALESCE(c.cc, 0)::int,
    COALESCE(a.cnt, 0)::int,
    COALESCE(w.wh, 0)::numeric
  FROM call_agg c
  FULL OUTER JOIN appo_agg a ON c.gn = a.gn
  FULL OUTER JOIN work_hours_agg w ON COALESCE(c.gn, a.gn) = w.gn
  ORDER BY COALESCE(c.cnt, 0) DESC;
END;
$$;

-- 5.5) perf_ranking_scoped
DROP FUNCTION IF EXISTS public.perf_ranking_scoped(timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.perf_ranking_scoped(
  p_from timestamptz, p_to timestamptz, p_list_id uuid DEFAULT NULL
)
  RETURNS TABLE(getter_name text, calls integer, keyman_connect integer, appo integer)
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_cc text[] := public._perf_keyman_connect_labels();
BEGIN
  RETURN QUERY
  SELECT
    cr.getter_name::text,
    COUNT(*)::int AS calls,
    COUNT(*) FILTER (WHERE cr.status = ANY(v_cc))::int AS keyman_connect,
    COUNT(*) FILTER (WHERE cr.status = 'アポ獲得')::int AS appo
  FROM public.call_records cr
  WHERE cr.org_id = v_org
    AND cr.called_at >= p_from
    AND cr.called_at <= p_to
    AND cr.getter_name IS NOT NULL
    AND (p_list_id IS NULL OR cr.list_id = p_list_id)
  GROUP BY cr.getter_name
  ORDER BY COUNT(*) DESC;
END;
$$;

-- 5.6) perf_weekly_trend
DROP FUNCTION IF EXISTS public.perf_weekly_trend(date, integer);
CREATE OR REPLACE FUNCTION public.perf_weekly_trend(p_week_start date, p_weeks integer DEFAULT 8)
  RETURNS TABLE(week_start date, calls integer, keyman_connect integer, appo integer)
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_cc text[] := public._perf_keyman_connect_labels();
  v_from timestamptz := ((p_week_start - (p_weeks - 1) * 7)::timestamp AT TIME ZONE 'Asia/Tokyo');
  v_to   timestamptz := ((p_week_start + 7)::timestamp AT TIME ZONE 'Asia/Tokyo');
BEGIN
  RETURN QUERY
  WITH weeks AS (
    SELECT generate_series(
      p_week_start - (p_weeks - 1) * 7,
      p_week_start,
      '7 days'::interval
    )::date AS ws
  ),
  daily AS (
    SELECT
      (called_at AT TIME ZONE 'Asia/Tokyo')::date AS jst_date,
      status
    FROM public.call_records
    WHERE org_id = v_org
      AND called_at >= v_from AND called_at < v_to
  )
  SELECT
    w.ws AS week_start,
    count(d.status)::int AS calls,
    count(d.status) FILTER (WHERE d.status = ANY(v_cc))::int AS keyman_connect,
    count(d.status) FILTER (WHERE d.status = 'アポ獲得')::int AS appo
  FROM weeks w
  LEFT JOIN daily d ON d.jst_date >= w.ws AND d.jst_date < w.ws + 7
  GROUP BY w.ws
  ORDER BY w.ws;
END;
$$;

-- 5.7) perf_call_heatmap（helper呼出のみ変更）
CREATE OR REPLACE FUNCTION public.perf_call_heatmap(
  p_from timestamptz, p_to timestamptz,
  p_getter_name text DEFAULT NULL,
  p_getter_names text[] DEFAULT NULL,
  p_list_id uuid DEFAULT NULL
)
  RETURNS TABLE(dow integer, hour integer, calls bigint, connects bigint)
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_cc text[] := public._perf_keyman_connect_labels();
BEGIN
  RETURN QUERY
  SELECT
    (EXTRACT(ISODOW FROM (cr.called_at AT TIME ZONE 'Asia/Tokyo')) - 1)::int AS dow,
    EXTRACT(HOUR FROM (cr.called_at AT TIME ZONE 'Asia/Tokyo'))::int AS hour,
    COUNT(*)::bigint AS calls,
    COUNT(*) FILTER (WHERE cr.status = ANY(v_cc))::bigint AS connects
  FROM public.call_records cr
  WHERE cr.org_id = v_org
    AND cr.called_at >= p_from
    AND cr.called_at <= p_to
    AND (p_getter_name IS NULL OR cr.getter_name = p_getter_name)
    AND (p_getter_names IS NULL OR cr.getter_name = ANY(p_getter_names))
    AND (p_list_id IS NULL OR cr.list_id = p_list_id)
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

-- 5.8) get_call_ranking（ハードコードラベル＆戻りカラム両方）
DROP FUNCTION IF EXISTS public.get_call_ranking(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.get_call_ranking(from_iso timestamptz, to_iso timestamptz)
  RETURNS TABLE(getter_name text, total bigint, keyman_connect bigint, appo bigint)
  LANGUAGE sql
  STABLE
AS $$
  SELECT
    getter_name,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status IN ('キーマン再コール', 'アポ獲得', 'キーマン断り')) as keyman_connect,
    COUNT(*) FILTER (WHERE status = 'アポ獲得') as appo
  FROM call_records
  WHERE called_at >= from_iso AND called_at <= to_iso
  GROUP BY getter_name
$$;

-- 5.9) sourcing_call_result_by_list（param/returnカラム両方 rename）
DROP FUNCTION IF EXISTS public.sourcing_call_result_by_list(uuid, uuid, text[], timestamptz, timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.sourcing_call_result_by_list(
  p_client_id uuid,
  p_org_id uuid,
  p_keyman_labels text[],
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL,
  p_list_id uuid DEFAULT NULL
)
  RETURNS TABLE(list_id uuid, list_name text, industry text, is_archived boolean, calls bigint, keyman_connects bigint, appos bigint)
  LANGUAGE plpgsql
  STABLE
AS $$
declare
  v_client_id uuid := case when is_client_user() then current_client_id() else p_client_id end;
  v_org_id    uuid := case when is_client_user() then current_client_org_id() else p_org_id end;
begin
  return query
  select
    cl.id, cl.name, cl.industry,
    coalesce(cl.is_archived, false),
    coalesce(cr_agg.calls, 0),
    coalesce(cr_agg.keyman_connects, 0),
    coalesce(a_agg.appos, 0)
  from call_lists cl
  left join lateral (
    select count(*) as calls,
      count(*) filter (where cr.status = any(p_keyman_labels)) as keyman_connects
    from call_records cr
    where cr.list_id = cl.id and cr.org_id = v_org_id
      and (p_from is null or cr.called_at >= p_from)
      and (p_to   is null or cr.called_at <  p_to)
  ) cr_agg on true
  left join lateral (
    select count(*) as appos
    from appointments a
    where a.list_id = cl.id and a.org_id = v_org_id
      and (v_client_id is null or a.client_id = v_client_id)
      and (p_from is null or a.created_at >= p_from)
      and (p_to   is null or a.created_at <  p_to)
  ) a_agg on true
  where cl.org_id = v_org_id
    and ((p_list_id is not null and cl.id = p_list_id)
      or (p_list_id is null and cl.client_id = v_client_id))
  order by coalesce(cl.is_archived, false), cl.name nulls last;
end;
$$;

-- 5.10) dashboard_old_rejections（ハードコード'社長お断り'を'キーマン断り'へ）
CREATE OR REPLACE FUNCTION public.dashboard_old_rejections(p_days integer DEFAULT 14)
  RETURNS jsonb
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  WITH my_org AS (SELECT get_user_org_id() AS org_id),
  latest AS (
    SELECT DISTINCT ON (item_id) *
    FROM call_records
    WHERE org_id = (SELECT org_id FROM my_org)
    ORDER BY item_id, round DESC, called_at DESC
  ),
  filtered AS (
    SELECT
      latest.id           AS record_id,
      latest.list_id,
      latest.item_id,
      cli.company,
      cl.name             AS list_name,
      latest.called_at,
      latest.getter_name
    FROM latest
    JOIN call_lists cl ON cl.id = latest.list_id
    LEFT JOIN call_list_items cli ON cli.id = latest.item_id
    WHERE latest.status = 'キーマン断り'
      AND latest.called_at <= now() - (p_days || ' days')::interval
      AND (cl.is_archived IS NULL OR cl.is_archived = false)
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(filtered) ORDER BY filtered.called_at DESC), '[]'::jsonb)
  FROM filtered;
$$;

-- 5.11) dashboard_overdue_recalls（'社長再コール'を'キーマン再コール'へ）
CREATE OR REPLACE FUNCTION public.dashboard_overdue_recalls()
  RETURNS jsonb
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  WITH my_org AS (SELECT get_user_org_id() AS org_id),
  latest AS (
    SELECT DISTINCT ON (item_id) *
    FROM call_records
    WHERE org_id = (SELECT org_id FROM my_org)
    ORDER BY item_id, round DESC, called_at DESC
  ),
  filtered AS (
    SELECT
      latest.id AS record_id,
      latest.list_id,
      latest.item_id,
      cli.company,
      cl.name AS list_name,
      (latest.memo::jsonb)->>'recall_date' AS recall_date,
      COALESCE(NULLIF((latest.memo::jsonb)->>'recall_time', ''), '00:00') AS recall_time,
      (latest.memo::jsonb)->>'assignee' AS assignee,
      latest.getter_name,
      latest.called_at,
      ((latest.memo::jsonb)->>'recall_date'
        || 'T'
        || COALESCE(NULLIF((latest.memo::jsonb)->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz AS _recall_at
    FROM latest
    JOIN call_lists cl ON cl.id = latest.list_id
    LEFT JOIN call_list_items cli ON cli.id = latest.item_id
    WHERE latest.status = 'キーマン再コール'
      AND (cl.is_archived IS NULL OR cl.is_archived = false)
      AND NULLIF((latest.memo::jsonb)->>'recall_date', '') IS NOT NULL
      AND COALESCE(NULLIF((latest.memo::jsonb)->>'recall_completed', ''), 'false')::boolean = false
      AND ((latest.memo::jsonb)->>'recall_date'
        || 'T'
        || COALESCE(NULLIF((latest.memo::jsonb)->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz < now()
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'record_id',   record_id,
      'list_id',     list_id,
      'item_id',     item_id,
      'company',     company,
      'list_name',   list_name,
      'recall_date', recall_date,
      'recall_time', recall_time,
      'assignee',    assignee,
      'getter_name', getter_name,
      'called_at',   called_at
    ) ORDER BY _recall_at ASC
  ), '[]'::jsonb)
  FROM filtered;
$$;
