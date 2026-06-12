set local search_path = public, extensions;

-- 再アプローチ候補RPCを温度感フィルタ対応に拡張（本番適用済み）。
-- temp列を返し、p_temps配列で含める温度感(HIGH/MEDIUM/LOW)を指定可能。既定はHIGH+MEDIUM。
create or replace function public.dashboard_member_reapproach(
  p_getter text,
  p_org uuid,
  p_temps text[] default array['HIGH','MEDIUM']
)
returns table(
  call_id uuid, called_at timestamptz, rejection_reason text, temp text,
  list_id uuid, list_name text, item_id uuid, company text, phone text,
  recording_url text
)
language sql stable security definer set search_path to 'public'
as $function$
  select distinct on (cr.item_id)
    cr.id as call_id, cr.called_at, cr.rejection_reason,
    upper(split_part(regexp_replace(coalesce(cr.rejection_reason,''), E'\s.*$', ''), E'\n', 1)) as temp,
    cl.id as list_id, cl.name as list_name, cli.id as item_id,
    cli.company, cli.phone, cr.recording_url
  from call_records cr
  join call_list_items cli on cli.id = cr.item_id
  join call_lists cl on cl.id = cli.list_id
  where cl.org_id = p_org
    and cr.getter_name = p_getter
    and cr.status = 'キーマン断り'
    and cli.call_status = 'キーマン断り'
    and upper(split_part(regexp_replace(coalesce(cr.rejection_reason,''), E'\s.*$', ''), E'\n', 1)) = any(p_temps)
    and (cl.is_archived is null or cl.is_archived = false)
    and not exists (
      select 1 from mv_excluded_items mex
       where mex.org_id = p_org and mex.item_id = cli.id
    )
  order by cr.item_id, cr.called_at desc;
$function$;
