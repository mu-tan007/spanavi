-- perf_ranking の work_hours 計算を「最初〜最後の素通り」から
-- 「30分以上のアイドルギャップを控除した実稼働」に変更する。
--
-- 旧: SUM(MAX(called_at) - MIN(called_at)) per (person, day)
-- 新: SUM((MAX - MIN) - SUM(gap_over_30min)) per (person, day)
--
-- これにより、午前+夕方の飛び石稼働で昼間の長時間アイドルが分母から外れ、
-- 件/h が実態に近づく。しきい値は 1800 秒 (30 分) 固定。

set local search_path = public, extensions;

DROP FUNCTION IF EXISTS public.perf_ranking(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.perf_ranking(p_from timestamptz, p_to timestamptz)
  RETURNS TABLE(getter_name text, calls integer, keyman_connect integer, appo integer, work_hours numeric)
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
AS $$
DECLARE
  v_org uuid := public.get_user_org_id();
  v_cc  text[] := public._perf_keyman_connect_labels();
  v_idle_threshold_sec constant int := 1800;
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
  ordered_calls AS (
    SELECT
      cr.getter_name AS gn,
      (cr.called_at AT TIME ZONE 'Asia/Tokyo')::date AS jst_date,
      cr.called_at,
      LAG(cr.called_at) OVER (
        PARTITION BY cr.getter_name, (cr.called_at AT TIME ZONE 'Asia/Tokyo')::date
        ORDER BY cr.called_at
      ) AS prev_at
    FROM public.call_records cr
    WHERE cr.org_id = v_org
      AND cr.called_at >= p_from AND cr.called_at <= p_to
      AND cr.getter_name IS NOT NULL
  ),
  daily_work AS (
    SELECT
      oc.gn,
      oc.jst_date,
      MIN(oc.called_at) AS day_min,
      MAX(oc.called_at) AS day_max,
      COALESCE(SUM(
        CASE
          WHEN oc.prev_at IS NOT NULL
           AND EXTRACT(EPOCH FROM (oc.called_at - oc.prev_at)) > v_idle_threshold_sec
          THEN EXTRACT(EPOCH FROM (oc.called_at - oc.prev_at))
          ELSE 0
        END
      ), 0) AS gap_seconds
    FROM ordered_calls oc
    GROUP BY oc.gn, oc.jst_date
  ),
  work_hours_agg AS (
    SELECT
      dw.gn,
      ROUND(SUM(
        GREATEST(
          EXTRACT(EPOCH FROM (dw.day_max - dw.day_min)) - dw.gap_seconds,
          0
        ) / 3600.0
      )::numeric, 2) AS wh
    FROM daily_work dw
    WHERE dw.day_max > dw.day_min
    GROUP BY dw.gn
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
