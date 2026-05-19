-- ============================================================
-- dashboard_reapproach_candidates: 最新 call_records.status が
-- 'アポ獲得' のアイテムを除外する
--
-- 背景:
--   既存ロジックは appointments テーブルに同一電話番号のレコードが
--   あれば「再アプローチ候補」として出していたが、自分以外のメンバーが
--   "直近で" アポ取得した（=その call_list_item の最新 call_records.status
--   が 'アポ獲得'）ケースも候補に混入していた。
--   アポ獲得直後のアイテムは再アプローチ対象ではないため、最新ステータス
--   が 'アポ獲得' のアイテムを除外する。
-- ============================================================
set local search_path = public, extensions;

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
       -- 各 active_item の最新 call_records.status を取得
       latest_status AS (
         SELECT DISTINCT ON (cr.item_id) cr.item_id, cr.status
         FROM call_records cr
         WHERE cr.org_id = (SELECT oid FROM my_org)
           AND cr.item_id IN (SELECT item_id FROM active_items)
         ORDER BY cr.item_id, cr.round DESC, cr.called_at DESC
       ),
       phone_matched AS (
         SELECT DISTINCT ON (ai.item_id)
           ai.item_id, ai.list_id, ai.list_name, ai.client_id, ai.company, ai.phone,
           p.getter_name AS past_getter, p.client_name AS past_client, p.get_date AS past_date,
           'spanavi'::text AS source
         FROM active_items ai
         JOIN past p ON p.phone_n = ai.phone_n
         LEFT JOIN latest_status ls ON ls.item_id = ai.item_id
         WHERE length(ai.phone_n) >= 8
           AND ai.phone_n NOT IN (SELECT phone_n FROM self_phones)
           AND COALESCE(ls.status, '') <> 'アポ獲得'
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
         LEFT JOIN latest_status ls ON ls.item_id = ai.item_id
         WHERE ai.item_id NOT IN (SELECT item_id FROM phone_matched)
           AND COALESCE(ls.status, '') <> 'アポ獲得'
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
