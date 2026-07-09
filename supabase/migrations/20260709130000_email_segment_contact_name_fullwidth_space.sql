-- メルマガ宛名: クライアント担当者の contact_name を「姓 名」半角スペース → 全角スペースに整形
--
-- CRM の client_contacts.name は「鹿之賦 勇輝」のように姓名間を半角スペースで登録している。
-- メルマガ宛名では「鹿之賦　勇輝 様」（姓名間=全角スペース、名と様の間=半角スペース）に
-- 揃えたいので、merge_vars.contact_name を差込時点で半角→全角スペース変換する。
-- 変更点は client_contact セグメントの contact_name のみ。他は 20260605200100 と同一。

set local search_path = public, extensions;

create or replace function public.compute_campaign_segment(p_segment jsonb)
returns table (
  recipient_type    text,
  client_id         uuid,
  client_contact_id uuid,
  lead_company_id   uuid,
  email             text,
  display_name      text,
  merge_vars        jsonb
)
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_org_id          uuid := public.get_user_org_id();
  v_cc_enabled      boolean := coalesce((p_segment->'client_contacts'->>'enabled')::boolean, false);
  v_cc_statuses     jsonb   := coalesce(p_segment->'client_contacts'->'statuses', '[]'::jsonb);
  v_cc_engagements  jsonb   := coalesce(p_segment->'client_contacts'->'engagement_ids', '[]'::jsonb);
  v_cc_primary_only boolean := coalesce((p_segment->'client_contacts'->>'primary_only')::boolean, false);
  v_lc_enabled      boolean := coalesce((p_segment->'lead_companies'->>'enabled')::boolean, false);
  v_lc_lists        jsonb   := coalesce(p_segment->'lead_companies'->'list_ids', '[]'::jsonb);
  v_lc_excl_promo   boolean := coalesce((p_segment->'lead_companies'->>'exclude_promoted')::boolean, true);
  v_lc_excl_excl    boolean := coalesce((p_segment->'lead_companies'->>'exclude_excluded')::boolean, true);
  v_manual          jsonb   := coalesce(p_segment->'manual_emails', '[]'::jsonb);
begin
  if v_org_id is null then
    return;
  end if;

  -- ================== クライアント担当者 ==================
  if v_cc_enabled then
    return query
    select
      'client_contact'::text as recipient_type,
      cl.id as client_id,
      cc.id as client_contact_id,
      null::uuid as lead_company_id,
      lower(trim(cc.email)) as email,
      cc.name as display_name,
      jsonb_build_object(
        'client_name', cl.name,
        -- 姓名間の半角スペースを全角スペースに（宛名の見栄え統一）
        'contact_name', replace(coalesce(cc.name, ''), ' ', '　'),
        'status', coalesce(cl.status, ''),
        'engagement_name', coalesce(eng.name, '')
      ) as merge_vars
    from public.client_contacts cc
    join public.clients cl on cl.id = cc.client_id
    left join public.engagements eng on eng.id = cl.engagement_id
    where cc.org_id = v_org_id
      and cl.org_id = v_org_id
      and cc.email is not null
      and trim(cc.email) <> ''
      and (jsonb_array_length(v_cc_statuses) = 0
           or cl.status = any(select jsonb_array_elements_text(v_cc_statuses)))
      and (jsonb_array_length(v_cc_engagements) = 0
           or cl.engagement_id = any(select (jsonb_array_elements_text(v_cc_engagements))::uuid))
      and (not v_cc_primary_only or cc.is_primary = true)
      -- グローバルオプトアウト除外
      and not exists (
        select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id
          and u.email = lower(trim(cc.email))
          and u.scope = 'global'
      )
      -- 商材別オプトアウト除外
      and not exists (
        select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id
          and u.email = lower(trim(cc.email))
          and u.scope = 'engagement'
          and u.engagement_id = cl.engagement_id
      );
  end if;

  -- ================== 見込み客 ==================
  if v_lc_enabled then
    return query
    select
      'lead_company'::text as recipient_type,
      null::uuid as client_id,
      null::uuid as client_contact_id,
      lc.id as lead_company_id,
      lower(trim(lc.email)) as email,
      coalesce(lc.representative, lc.company) as display_name,
      jsonb_build_object(
        'company_name', lc.company,
        'representative', coalesce(lc.representative, ''),
        'business', coalesce(lc.business, ''),
        'prefecture', coalesce(lc.prefecture, '')
      ) as merge_vars
    from public.client_lead_companies lc
    where lc.org_id = v_org_id
      and lc.email is not null
      and trim(lc.email) <> ''
      and (jsonb_array_length(v_lc_lists) = 0
           or lc.list_id = any(select (jsonb_array_elements_text(v_lc_lists))::uuid))
      and (not v_lc_excl_promo or lc.promoted_to_client_id is null)
      and (not v_lc_excl_excl or coalesce(lc.is_excluded, false) = false)
      and not exists (
        select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id
          and u.email = lower(trim(lc.email))
          and u.scope = 'global'
      );
  end if;

  -- ================== 手動指定メール ==================
  if jsonb_array_length(v_manual) > 0 then
    return query
    select
      'manual'::text as recipient_type,
      null::uuid as client_id,
      null::uuid as client_contact_id,
      null::uuid as lead_company_id,
      lower(trim(m->>'email')) as email,
      coalesce(m->>'display_name', '') as display_name,
      jsonb_build_object(
        'display_name', coalesce(m->>'display_name', '')
      ) as merge_vars
    from jsonb_array_elements(v_manual) m
    where m->>'email' is not null
      and trim(m->>'email') <> ''
      and not exists (
        select 1 from public.email_unsubscribes u
        where u.org_id = v_org_id
          and u.email = lower(trim(m->>'email'))
          and u.scope = 'global'
      );
  end if;
end $$;

comment on function public.compute_campaign_segment(jsonb) is
  'メルマガセグメント条件から配信対象を返す。contact_name は姓名間を全角スペースに整形。RLS は SECURITY INVOKER で呼出ユーザーの org_id に自動絞込。同一emailが複数経路で出る可能性あり（呼出側で distinct on email 推奨）';
