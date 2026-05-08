-- Dashboard RPCs を jsonb_agg で 1 行返す形に書き換え。
-- PostgREST の Max Rows (1000) で頭打ちになるのを回避するための対応。
-- 戻り値の中身（フィールド名）は従来と同じなのでクライアント側の変更は不要。

set local search_path = public, extensions;

-- 戻り型を TABLE → jsonb に変えるため、既存関数を一旦 DROP する
DROP FUNCTION IF EXISTS public.dashboard_old_rejections(integer);
DROP FUNCTION IF EXISTS public.dashboard_overdue_recalls();
DROP FUNCTION IF EXISTS public.dashboard_reapproach_candidates();

-- ============================================================
-- 1) dashboard_old_rejections : 社長お断り N 日経過
-- ============================================================
CREATE OR REPLACE FUNCTION public.dashboard_old_rejections(p_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHERE latest.status = '社長お断り'
      AND latest.called_at <= now() - (p_days || ' days')::interval
      AND (cl.is_archived IS NULL OR cl.is_archived = false)
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(filtered) ORDER BY filtered.called_at DESC), '[]'::jsonb)
  FROM filtered;
$function$;

-- ============================================================
-- 2) dashboard_overdue_recalls : 社長再コール超過
-- ============================================================
CREATE OR REPLACE FUNCTION public.dashboard_overdue_recalls()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHERE latest.status = '社長再コール'
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
$function$;

-- ============================================================
-- 3) dashboard_reapproach_candidates : 再アプローチ候補
-- ============================================================
CREATE OR REPLACE FUNCTION public.dashboard_reapproach_candidates()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH my_org AS (SELECT get_user_org_id() AS oid),
       my_name AS (
         SELECT m.name FROM members m
         WHERE m.user_id = auth.uid() AND m.org_id = (SELECT oid FROM my_org)
         LIMIT 1
       ),
       past AS (
         SELECT a.phone,
                a.getter_name,
                COALESCE(a.appointment_date, a.created_at::date) AS get_date,
                c.name AS client_name,
                regexp_replace(a.phone, '[^0-9]', '', 'g') AS phone_n
         FROM appointments a
         LEFT JOIN clients c ON c.id = a.client_id
         WHERE a.org_id = (SELECT oid FROM my_org)
           AND a.status IN ('面談済','事前確認済','アポ取得')
           AND a.phone IS NOT NULL
           AND length(regexp_replace(a.phone, '[^0-9]', '', 'g')) >= 8
       ),
       self_phones AS (
         SELECT DISTINCT regexp_replace(phone, '[^0-9]', '', 'g') AS phone_n
         FROM appointments
         WHERE org_id = (SELECT oid FROM my_org)
           AND getter_name = COALESCE((SELECT name FROM my_name), '')
           AND phone IS NOT NULL
       ),
       active_items AS (
         SELECT cli.id AS item_id, cli.list_id, cli.company, cli.phone,
                regexp_replace(COALESCE(cli.phone,''), '[^0-9]', '', 'g') AS phone_n,
                cl.name AS list_name, cl.client_id
         FROM call_list_items cli
         JOIN call_lists cl ON cl.id = cli.list_id
         WHERE cli.org_id = (SELECT oid FROM my_org)
           AND (cl.is_archived IS NULL OR cl.is_archived = false)
           AND cl.status = '架電可能'
       ),
       phone_matched AS (
         SELECT DISTINCT ON (ai.item_id)
           ai.item_id, ai.list_id, ai.list_name, ai.client_id, ai.company, ai.phone,
           p.getter_name AS past_getter, p.client_name AS past_client, p.get_date AS past_date,
           'spanavi'::text AS source
         FROM active_items ai
         JOIN past p ON p.phone_n = ai.phone_n
         WHERE length(ai.phone_n) >= 8
           AND ai.phone_n NOT IN (SELECT phone_n FROM self_phones)
         ORDER BY ai.item_id, p.get_date DESC
       ),
       legacy_matched AS (
         SELECT ai.item_id, ai.list_id, ai.list_name, ai.client_id, ai.company, ai.phone,
                NULL::text AS past_getter, NULL::text AS past_client, NULL::date AS past_date,
                'legacy'::text AS source
         FROM active_items ai
         JOIN past_appointment_companies_legacy pac
           ON pac.org_id = (SELECT oid FROM my_org)
          AND TRIM(pac.company_name) = TRIM(ai.company)
         WHERE ai.item_id NOT IN (SELECT item_id FROM phone_matched)
       ),
       all_candidates AS (
         SELECT * FROM phone_matched
         UNION ALL
         SELECT * FROM legacy_matched
       ),
       final_rows AS (
         SELECT ac.item_id, ac.list_id, ac.list_name, ac.client_id,
                cl2.name AS client_name, ac.company, ac.phone,
                ac.past_getter, ac.past_client, ac.past_date, ac.source
         FROM all_candidates ac
         LEFT JOIN clients cl2 ON cl2.id = ac.client_id
       )
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(final_rows)
      ORDER BY final_rows.past_date ASC NULLS LAST, final_rows.company ASC
    ),
    '[]'::jsonb
  )
  FROM final_rows;
$function$;
