-- メルマガ配信先: クライアント担当者セグメントに client_ids(個別企業選択) を追加。
--
-- segment_definition.client_contacts.client_ids: [uuid] を新設。
--   空配列 → 従来どおり status/engagement/primary で全件絞り込み
--   非空   → 指定した clients.id のみに絞る(UIの個別チェック選択用)
-- 他のフィルタ(status/engagement/primary/オプトアウト)とはAND。
-- 両オーバーロード(1引数=UIプレビュー / 2引数=send-campaign実配信)に適用。
--
-- ※本ファイルは 20260709130000/130500(全角整形)を含む最新定義の上書き。

set local search_path = public, extensions;

create or replace function public.compute_campaign_segment(p_segment jsonb)
returns table (
  recipient_type text, client_id uuid, client_contact_id uuid, lead_company_id uuid,
  email text, display_name text, merge_vars jsonb
)
language plpgsql security invoker set search_path = public, extensions
as $$
declare
  v_org_id          uuid    := public.get_user_org_id();
  v_cc_enabled      boolean := coalesce((p_segment->'client_contacts'->>'enabled')::boolean, false);
  v_cc_statuses     jsonb   := coalesce(p_segment->'client_contacts'->'statuses', '[]'::jsonb);
  v_cc_engagements  jsonb   := coalesce(p_segment->'client_contacts'->'engagement_ids', '[]'::jsonb);
  v_cc_client_ids   jsonb   := coalesce(p_segment->'client_contacts'->'client_ids', '[]'::jsonb);
  v_cc_primary_only boolean := coalesce((p_segment->'client_contacts'->>'primary_only')::boolean, false);
  v_lc_enabled      boolean := coalesce((p_segment->'lead_companies'->>'enabled')::boolean, false);
  v_lc_lists        jsonb   := coalesce(p_segment->'lead_companies'->'list_ids', '[]'::jsonb);
  v_lc_excl_promo   boolean := coalesce((p_segment->'lead_companies'->>'exclude_promoted')::boolean, true);
  v_lc_excl_excl    boolean := coalesce((p_segment->'lead_companies'->>'exclude_excluded')::boolean, true);
  v_manual          jsonb   := coalesce(p_segment->'manual_emails', '[]'::jsonb);
begin
  if v_org_id is null then return; end if;

  if v_cc_enabled then
    return query
    select 'client_contact'::text, cl.id, cc.id, null::uuid,
      lower(trim(cc.email)), cc.name,
      jsonb_build_object(
        'client_name', cl.name,
        'contact_name', replace(coalesce(cc.name, ''), ' ', '　'),
        'status', coalesce(cl.status, ''),
        'engagement_name', coalesce(eng.name, '')
      )
    from public.client_contacts cc
    join public.clients cl on cl.id = cc.client_id
    left join public.engagements eng on eng.id = cl.engagement_id
    where cc.org_id = v_org_id and cl.org_id = v_org_id
      and cc.email is not null and trim(cc.email) <> ''
      and (jsonb_array_length(v_cc_client_ids) = 0
           or cl.id = any(select (jsonb_array_elements_text(v_cc_client_ids))::uuid))
      and (jsonb_array_length(v_cc_statuses) = 0
           or cl.status = any(select jsonb_array_elements_text(v_cc_statuses)))
      and (jsonb_array_length(v_cc_engagements) = 0
           or cl.engagement_id = any(select (jsonb_array_elements_text(v_cc_engagements))::uuid))
      and (not v_cc_primary_only or cc.is_primary = true)
      and not exists (select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id and u.email = lower(trim(cc.email)) and u.scope = 'global')
      and not exists (select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id and u.email = lower(trim(cc.email))
          and u.scope = 'engagement' and u.engagement_id = cl.engagement_id);
  end if;

  if v_lc_enabled then
    return query
    select 'lead_company'::text, null::uuid, null::uuid, lc.id,
      lower(trim(lc.email)), coalesce(lc.representative, lc.company),
      jsonb_build_object('company_name', lc.company, 'representative', coalesce(lc.representative, ''),
        'business', coalesce(lc.business, ''), 'prefecture', coalesce(lc.prefecture, ''))
    from public.client_lead_companies lc
    where lc.org_id = v_org_id and lc.email is not null and trim(lc.email) <> ''
      and (jsonb_array_length(v_lc_lists) = 0
           or lc.list_id = any(select (jsonb_array_elements_text(v_lc_lists))::uuid))
      and (not v_lc_excl_promo or lc.promoted_to_client_id is null)
      and (not v_lc_excl_excl or coalesce(lc.is_excluded, false) = false)
      and not exists (select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id and u.email = lower(trim(lc.email)) and u.scope = 'global');
  end if;

  if jsonb_array_length(v_manual) > 0 then
    return query
    select 'manual'::text, null::uuid, null::uuid, null::uuid,
      lower(trim(m->>'email')), coalesce(m->>'display_name', ''),
      jsonb_build_object('display_name', coalesce(m->>'display_name', ''))
    from jsonb_array_elements(v_manual) m
    where m->>'email' is not null and trim(m->>'email') <> ''
      and not exists (select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id and u.email = lower(trim(m->>'email')) and u.scope = 'global');
  end if;
end $$;

create or replace function public.compute_campaign_segment(p_segment jsonb, p_org_id uuid default null::uuid)
returns table (
  recipient_type text, client_id uuid, client_contact_id uuid, lead_company_id uuid,
  email text, display_name text, merge_vars jsonb
)
language plpgsql set search_path to 'public', 'extensions'
as $$
declare
  v_org_id          uuid    := coalesce(p_org_id, public.get_user_org_id());
  v_cc_enabled      boolean := coalesce((p_segment->'client_contacts'->>'enabled')::boolean, false);
  v_cc_statuses     jsonb   := coalesce(p_segment->'client_contacts'->'statuses', '[]'::jsonb);
  v_cc_engagements  jsonb   := coalesce(p_segment->'client_contacts'->'engagement_ids', '[]'::jsonb);
  v_cc_client_ids   jsonb   := coalesce(p_segment->'client_contacts'->'client_ids', '[]'::jsonb);
  v_cc_primary_only boolean := coalesce((p_segment->'client_contacts'->>'primary_only')::boolean, false);
  v_lc_enabled      boolean := coalesce((p_segment->'lead_companies'->>'enabled')::boolean, false);
  v_lc_lists        jsonb   := coalesce(p_segment->'lead_companies'->'list_ids', '[]'::jsonb);
  v_lc_excl_promo   boolean := coalesce((p_segment->'lead_companies'->>'exclude_promoted')::boolean, true);
  v_lc_excl_excl    boolean := coalesce((p_segment->'lead_companies'->>'exclude_excluded')::boolean, true);
  v_manual          jsonb   := coalesce(p_segment->'manual_emails', '[]'::jsonb);
begin
  if v_org_id is null then return; end if;

  if v_cc_enabled then
    return query
    select 'client_contact'::text, cl.id, cc.id, null::uuid,
      lower(trim(cc.email)), cc.name,
      jsonb_build_object(
        'client_name', cl.name,
        'contact_name', replace(coalesce(cc.name, ''), ' ', '　'),
        'status', coalesce(cl.status, ''),
        'engagement_name', coalesce(eng.name, '')
      )
    from public.client_contacts cc
    join public.clients cl on cl.id = cc.client_id
    left join public.engagements eng on eng.id = cl.engagement_id
    where cc.org_id = v_org_id and cl.org_id = v_org_id
      and cc.email is not null and trim(cc.email) <> ''
      and (jsonb_array_length(v_cc_client_ids) = 0
           or cl.id = any(select (jsonb_array_elements_text(v_cc_client_ids))::uuid))
      and (jsonb_array_length(v_cc_statuses) = 0
           or cl.status = any(select jsonb_array_elements_text(v_cc_statuses)))
      and (jsonb_array_length(v_cc_engagements) = 0
           or cl.engagement_id = any(select (jsonb_array_elements_text(v_cc_engagements))::uuid))
      and (not v_cc_primary_only or cc.is_primary = true)
      and not exists (select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id and u.email = lower(trim(cc.email)) and u.scope = 'global')
      and not exists (select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id and u.email = lower(trim(cc.email))
          and u.scope = 'engagement' and u.engagement_id = cl.engagement_id);
  end if;

  if v_lc_enabled then
    return query
    select 'lead_company'::text, null::uuid, null::uuid, lc.id,
      lower(trim(lc.email)), coalesce(lc.representative, lc.company),
      jsonb_build_object('company_name', lc.company, 'representative', coalesce(lc.representative, ''),
        'business', coalesce(lc.business, ''), 'prefecture', coalesce(lc.prefecture, ''))
    from public.client_lead_companies lc
    where lc.org_id = v_org_id and lc.email is not null and trim(lc.email) <> ''
      and (jsonb_array_length(v_lc_lists) = 0
           or lc.list_id = any(select (jsonb_array_elements_text(v_lc_lists))::uuid))
      and (not v_lc_excl_promo or lc.promoted_to_client_id is null)
      and (not v_lc_excl_excl or coalesce(lc.is_excluded, false) = false)
      and not exists (select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id and u.email = lower(trim(lc.email)) and u.scope = 'global');
  end if;

  if jsonb_array_length(v_manual) > 0 then
    return query
    select 'manual'::text, null::uuid, null::uuid, null::uuid,
      lower(trim(m->>'email')), coalesce(m->>'display_name', ''),
      jsonb_build_object('display_name', coalesce(m->>'display_name', ''))
    from jsonb_array_elements(v_manual) m
    where m->>'email' is not null and trim(m->>'email') <> ''
      and not exists (select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id and u.email = lower(trim(m->>'email')) and u.scope = 'global');
  end if;
end $$;
