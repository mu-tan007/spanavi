-- =====================================================================
-- スマートキュー 厳密チェック ABC 対応
--
-- A) dashboard_reapproach_candidates の「除外」漏れ修正
--    - latest_status NOT IN リストに '除外' を追加
--    - mv_excluded_items NOT EXISTS を二重防御として追加
--    （現状実害 0 件だが、 過去アポ→除外パターンが将来混入し得るバグ）
--
-- B) RPC 古いオーバーロード削除（運用安定性向上）
--    smart_queue_keyman_rejections / _ids、 smart_queue_detailed_query / _ids、
--    smart_queue_industry_status_combo / _ids の古い版を削除
--
-- C) 未使用 RPC 削除（コード整理）
--    smart_queue_new_prospects, _unconnected_followup, _overdue_recalls, _unified
-- =====================================================================

set local search_path = public, extensions;

-- ── A) ⑤再アプローチ候補の除外漏れ修正 ─────────────────────────
create or replace function public.dashboard_reapproach_candidates()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with my_org as (select get_user_org_id() as oid),
       my_name as (
         select m.name from members m
         where m.user_id = auth.uid() and m.org_id = (select oid from my_org)
         limit 1
       ),
       past as (
         select a.phone, a.getter_name,
                coalesce(a.appointment_date, a.created_at::date) as get_date,
                c.name as client_name,
                regexp_replace(a.phone, '[^0-9]', '', 'g') as phone_n
         from appointments a
         left join clients c on c.id = a.client_id
         where a.org_id = (select oid from my_org)
           and a.status in ('面談済','事前確認済','アポ取得')
           and a.phone is not null
           and length(regexp_replace(a.phone, '[^0-9]', '', 'g')) >= 8
       ),
       self_phones as (
         select distinct regexp_replace(phone, '[^0-9]', '', 'g') as phone_n
         from appointments
         where org_id = (select oid from my_org)
           and getter_name = coalesce((select name from my_name), '')
           and phone is not null
       ),
       active_items as (
         select cli.id as item_id, cli.list_id, cli.company, cli.phone,
                regexp_replace(coalesce(cli.phone,''), '[^0-9]', '', 'g') as phone_n,
                cl.name as list_name, cl.client_id, cl.org_id
         from call_list_items cli
         join call_lists cl on cl.id = cli.list_id
         where cli.org_id = (select oid from my_org)
           and (cl.is_archived is null or cl.is_archived = false)
           and cl.status = '架電可能'
           and not exists (
             select 1 from mv_excluded_items mex
             where mex.org_id = cli.org_id and mex.item_id = cli.id
           )
       ),
       latest_status as (
         select distinct on (cr.item_id) cr.item_id, cr.status
         from call_records cr
         where cr.org_id = (select oid from my_org)
           and cr.item_id in (select item_id from active_items)
         order by cr.item_id, cr.round desc, cr.called_at desc
       ),
       phone_matched as (
         select distinct on (ai.item_id)
           ai.item_id, ai.list_id, ai.list_name, ai.client_id, ai.company, ai.phone,
           p.getter_name as past_getter, p.client_name as past_client, p.get_date as past_date,
           'spanavi'::text as source
         from active_items ai
         join past p on p.phone_n = ai.phone_n
         left join latest_status ls on ls.item_id = ai.item_id
         where length(ai.phone_n) >= 8
           and ai.phone_n not in (select phone_n from self_phones)
           and coalesce(ls.status, '') not in ('アポ獲得','受付再コール','キーマン再コール','社長再コール','除外')
         order by ai.item_id, p.get_date desc
       ),
       legacy_matched as (
         select ai.item_id, ai.list_id, ai.list_name, ai.client_id, ai.company, ai.phone,
                null::text as past_getter, null::text as past_client, null::date as past_date,
                'legacy'::text as source
         from active_items ai
         join past_appointment_companies_legacy pac
           on pac.org_id = (select oid from my_org)
          and trim(pac.company_name) = trim(ai.company)
         left join latest_status ls on ls.item_id = ai.item_id
         where ai.item_id not in (select item_id from phone_matched)
           and coalesce(ls.status, '') not in ('アポ獲得','受付再コール','キーマン再コール','社長再コール','除外')
       ),
       all_candidates as (
         select * from phone_matched union all select * from legacy_matched
       ),
       final_rows as (
         select ac.item_id, ac.list_id, ac.list_name, ac.client_id,
                cl2.name as client_name, ac.company, ac.phone,
                ac.past_getter, ac.past_client, ac.past_date, ac.source
         from all_candidates ac
         left join clients cl2 on cl2.id = ac.client_id
       )
  select coalesce(
    jsonb_agg(
      to_jsonb(final_rows)
      order by final_rows.past_date asc nulls last, final_rows.company asc
    ),
    '[]'::jsonb
  )
  from final_rows;
$$;

-- ── B) 古いオーバーロード削除 ─────────────────────────────────
drop function if exists public.smart_queue_keyman_rejections(p_engagement_id uuid, p_offset integer, p_limit integer);
drop function if exists public.smart_queue_keyman_rejections(p_engagement_id uuid, p_getter_names text[], p_sort text, p_offset integer, p_limit integer);
drop function if exists public.smart_queue_keyman_rejections(p_engagement_id uuid, p_getter_names text[], p_sort text, p_offset integer, p_limit integer, p_engagement_ids uuid[]);
drop function if exists public.smart_queue_keyman_rejections_ids(p_engagement_id uuid, p_getter_names text[], p_sort text);
drop function if exists public.smart_queue_keyman_rejections_ids(p_engagement_id uuid, p_getter_names text[], p_sort text, p_engagement_ids uuid[]);
drop function if exists public.smart_queue_detailed_query(p_statuses text[], p_prefectures text[], p_industries text[], p_revenue_min_k bigint, p_revenue_max_k bigint, p_days_min integer, p_days_max integer, p_engagement_id uuid, p_offset integer, p_limit integer);
drop function if exists public.smart_queue_detailed_query_ids(p_statuses text[], p_prefectures text[], p_industries text[], p_revenue_min_k bigint, p_revenue_max_k bigint, p_days_min integer, p_days_max integer, p_engagement_id uuid);
drop function if exists public.smart_queue_industry_status_combo(p_industries text[], p_statuses text[], p_engagement_id uuid, p_offset integer, p_limit integer);
drop function if exists public.smart_queue_industry_status_combo_ids(p_industries text[], p_statuses text[], p_engagement_id uuid);

-- ── C) 未使用 RPC 削除 ────────────────────────────────────────────
drop function if exists public.smart_queue_new_prospects(p_engagement_id uuid);
drop function if exists public.smart_queue_overdue_recalls(p_engagement_id uuid, p_status text);
drop function if exists public.smart_queue_unconnected_followup(p_engagement_id uuid, p_status text);
drop function if exists public.smart_queue_unified(p_engagement_id uuid, p_max integer);
