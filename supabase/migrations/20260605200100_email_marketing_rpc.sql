-- メルマガ機能 RPC: セグメント解釈とプレビュー
--
-- segment_definition の JSON 仕様:
-- {
--   "client_contacts": {
--     "enabled": true,
--     "statuses": ["支援中", "準備中", ...],   -- 空=全ステータス
--     "engagement_ids": ["uuid", ...],         -- 空=全商材
--     "primary_only": true                     -- 主担当のみ
--   },
--   "lead_companies": {
--     "enabled": true,
--     "list_ids": ["uuid", ...],               -- 空=全リスト
--     "exclude_promoted": true,                -- promoted_to_client_id NOT NULL を除外
--     "exclude_excluded": true                 -- is_excluded=true を除外
--   },
--   "manual_emails": [
--     { "email": "x@y.z", "display_name": "..." }
--   ]
-- }

set local search_path = public, extensions;

-- ============================================================
-- compute_campaign_segment: セグメント条件から配信対象リストを返す
-- ============================================================
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
        'contact_name', coalesce(cc.name, ''),
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
  'メルマガセグメント条件から配信対象を返す。RLS は SECURITY INVOKER で呼出ユーザーの org_id に自動絞込。同一emailが複数経路で出る可能性あり（呼出側で distinct on email 推奨）';

-- ============================================================
-- preview_campaign_recipients: UI プレビュー用 (件数+先頭サンプル)
-- ============================================================
create or replace function public.preview_campaign_recipients(
  p_segment jsonb,
  p_limit   int default 20
)
returns table (
  total_count   bigint,
  unique_emails bigint,
  sample        jsonb
)
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_total       bigint;
  v_unique      bigint;
  v_sample      jsonb;
begin
  with seg as (
    select * from public.compute_campaign_segment(p_segment)
  ),
  deduped as (
    -- 同一emailは「クライアント担当 > 見込み客 > 手動」優先で1度だけ
    select distinct on (email) *
    from seg
    order by email,
             case recipient_type
               when 'client_contact' then 1
               when 'lead_company' then 2
               when 'manual' then 3
             end
  )
  select
    (select count(*) from seg),
    (select count(*) from deduped),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'recipient_type', recipient_type,
        'email', email,
        'display_name', display_name,
        'merge_vars', merge_vars
      ))
       from (select * from deduped limit p_limit) s),
      '[]'::jsonb
    )
  into v_total, v_unique, v_sample;

  return query select v_total, v_unique, v_sample;
end $$;

comment on function public.preview_campaign_recipients(jsonb, int) is
  'メルマガ配信先プレビュー: 総件数・重複排除後件数・先頭サンプルを返す';

-- ============================================================
-- 権限: authenticated に EXECUTE
-- ============================================================
grant execute on function public.compute_campaign_segment(jsonb) to authenticated;
grant execute on function public.preview_campaign_recipients(jsonb, int) to authenticated;
