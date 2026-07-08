-- =====================================================================
-- 再コール「全員リリース」を予約日時から24時間後に遅延（担当者に専有猶予）
-- ---------------------------------------------------------------------
-- 経緯:
--   スマートキューの「③受付再コール超過 / ④キーマン再コール超過」タブは
--   リストを跨いで全員が拾える案件プール。従来は予約日時 (_recall_at) を
--   1秒でも過ぎた瞬間にこのプールへ載り、担当者以外も架電できていた。
--
--   要望: 予約日時ちょうどではなく「24時間経過した時点」で全員に開放する。
--   → 担当者本人には予約時刻どおり通知/赤ハイライト（据え置き）が出るため、
--     予約時刻〜+24h は事実上、担当者の専有猶予ウィンドウになる。
--
-- 変更点:
--   dashboard_overdue_reception_recalls / dashboard_overdue_recalls の
--   超過判定を  _recall_at < now()  →  _recall_at < (now() - interval '24 hours')
--   に変更。それ以外（client_name / mv_excluded_items 除外等）は現行のまま。
--
--   ※ 通知ベル(overdueSupaRecalls) と 再架電ページ赤ハイライト(isOverdue) は
--     担当者本人向けの個人リマインドのため、意図的に予約時刻基準のまま据え置く。
-- =====================================================================

set local search_path = public, extensions;

-- ------------------------------------------------------------
-- ③ 受付再コール超過（24時間猶予）
-- ------------------------------------------------------------
create or replace function dashboard_overdue_reception_recalls()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  latest as (
    select distinct on (item_id) *,
      case when left(memo, 1) = '{' then memo::jsonb end as memo_j
    from call_records
    where org_id = (select org_id from my_org)
    order by item_id, round desc, called_at desc
  ),
  filtered as (
    select
      latest.id as record_id, latest.list_id, latest.item_id,
      cli.company, cl.name as list_name,
      cl.client_id, c.name as client_name,
      latest.memo_j->>'recall_date' as recall_date,
      coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00') as recall_time,
      latest.memo_j->>'assignee' as assignee,
      latest.getter_name, latest.called_at,
      ((latest.memo_j->>'recall_date') || 'T'
        || coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz as _recall_at
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join clients c on c.id = cl.client_id
    left join call_list_items cli on cli.id = latest.item_id
    where latest.status = '受付再コール'
      and (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = latest.item_id
      )
      and nullif(latest.memo_j->>'recall_date', '') is not null
      and coalesce(nullif(latest.memo_j->>'recall_completed', ''), 'false')::boolean = false
      and ((latest.memo_j->>'recall_date') || 'T'
            || coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00')
            || ':00+09:00')::timestamptz < (now() - interval '24 hours')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', record_id, 'list_id', list_id, 'item_id', item_id,
    'company', company, 'list_name', list_name,
    'client_id', client_id, 'client_name', client_name,
    'recall_date', recall_date, 'recall_time', recall_time,
    'assignee', assignee, 'getter_name', getter_name, 'called_at', called_at
  ) order by _recall_at asc), '[]'::jsonb)
  from filtered;
$function$;

-- ------------------------------------------------------------
-- ④ キーマン再コール超過（24時間猶予）
-- ------------------------------------------------------------
create or replace function dashboard_overdue_recalls()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  with my_org as (select get_user_org_id() as org_id),
  latest as (
    select distinct on (item_id) *,
      case when left(memo, 1) = '{' then memo::jsonb end as memo_j
    from call_records
    where org_id = (select org_id from my_org)
    order by item_id, round desc, called_at desc
  ),
  filtered as (
    select
      latest.id as record_id, latest.list_id, latest.item_id,
      cli.company, cl.name as list_name,
      cl.client_id, c.name as client_name,
      latest.memo_j->>'recall_date' as recall_date,
      coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00') as recall_time,
      latest.memo_j->>'assignee' as assignee,
      latest.getter_name, latest.called_at,
      ((latest.memo_j->>'recall_date') || 'T'
        || coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00')
        || ':00+09:00')::timestamptz as _recall_at
    from latest
    join call_lists cl on cl.id = latest.list_id
    left join clients c on c.id = cl.client_id
    left join call_list_items cli on cli.id = latest.item_id
    where latest.status = 'キーマン再コール'
      and (cl.is_archived is null or cl.is_archived = false)
      and not exists (
        select 1 from mv_excluded_items mex
         where mex.org_id = (select org_id from my_org) and mex.item_id = latest.item_id
      )
      and nullif(latest.memo_j->>'recall_date', '') is not null
      and coalesce(nullif(latest.memo_j->>'recall_completed', ''), 'false')::boolean = false
      and ((latest.memo_j->>'recall_date') || 'T'
            || coalesce(nullif(latest.memo_j->>'recall_time', ''), '00:00')
            || ':00+09:00')::timestamptz < (now() - interval '24 hours')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'record_id', record_id, 'list_id', list_id, 'item_id', item_id,
    'company', company, 'list_name', list_name,
    'client_id', client_id, 'client_name', client_name,
    'recall_date', recall_date, 'recall_time', recall_time,
    'assignee', assignee, 'getter_name', getter_name, 'called_at', called_at
  ) order by _recall_at asc), '[]'::jsonb)
  from filtered;
$function$;
