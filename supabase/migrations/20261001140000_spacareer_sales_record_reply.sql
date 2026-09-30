-- CW自動送信ボットが読んだ「返信」を営業ファネルに記録する。
-- 呼び出し元は crowdworks-admin（service_role）の POST /api/replies。
-- 1ワーカーにつき最初の返信だけを出来事にする（source_ref='cw_reply:<worker_id>'）。
-- リードは worker_id で確定（match_method='reply'）し、呼び名も覚える。
create or replace function public.spacareer_sales_record_reply(
  p_license_key text,
  p_worker_id text,
  p_worker_name text,
  p_replied_at timestamptz,
  p_attrs jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead uuid;
  v_rep uuid;
  v_norm text := spacareer_norm_name(p_worker_name);
begin
  if p_worker_id is null or p_worker_id !~ '^\d+$' then
    raise exception 'invalid worker_id';
  end if;

  select rep_id into v_rep from cw_licenses where license_key = p_license_key;

  insert into spacareer_sales_leads (cw_worker_id, display_name, source, match_method)
  values (p_worker_id, coalesce(p_worker_name, p_worker_id), 'cw_scout', 'reply')
  on conflict (cw_worker_id) where cw_worker_id is not null
  do update set match_method = 'reply', updated_at = now()
  returning id into v_lead;

  if v_norm is not null then
    insert into spacareer_sales_lead_aliases (name_norm, lead_id) values (v_norm, v_lead)
    on conflict (name_norm) do nothing;
  end if;

  insert into spacareer_sales_events
    (lead_id, kind, occurred_at, rep_id, worker_name_raw, worker_name_norm, source, source_ref, attrs)
  values
    (v_lead, 'replied', coalesce(p_replied_at, now()), v_rep, p_worker_name, v_norm, 'cw_bot',
     'cw_reply:' || p_worker_id, coalesce(p_attrs, '{}'::jsonb) || jsonb_build_object('license_key', p_license_key))
  on conflict (source_ref) do nothing;

  -- 同じ名前で未照合だった Slack 報告があれば、ここで結びつく
  update spacareer_sales_events set lead_id = v_lead
   where lead_id is null and worker_name_norm = v_norm;

  return v_lead;
end;
$$;

revoke all on function public.spacareer_sales_record_reply(text, text, text, timestamptz, jsonb) from public, anon, authenticated;
