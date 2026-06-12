set local search_path = public, extensions;

-- 個人ダッシュボードの「再アプローチ候補」RPC（本番適用済み）
-- 指定メンバーが断られたキーマン断りのうち、AI温度感HIGH かつ
-- 企業の直近結果がキーマン断りのまま（その後アポ獲得/再コール登録で自動除外）、
-- 除外リスト外・非アーカイブのものだけ返す。
create or replace function public.dashboard_member_reapproach(p_getter text, p_org uuid)
returns table(
  call_id uuid, called_at timestamptz, rejection_reason text,
  list_id uuid, list_name text, item_id uuid, company text, phone text,
  recording_url text
)
language sql stable security definer set search_path to 'public'
as $function$
  select distinct on (cr.item_id)
    cr.id as call_id, cr.called_at, cr.rejection_reason,
    cl.id as list_id, cl.name as list_name, cli.id as item_id,
    cli.company, cli.phone, cr.recording_url
  from call_records cr
  join call_list_items cli on cli.id = cr.item_id
  join call_lists cl on cl.id = cli.list_id
  where cl.org_id = p_org
    and cr.getter_name = p_getter
    and cr.status = 'キーマン断り'
    and cli.call_status = 'キーマン断り'
    and upper(left(coalesce(cr.rejection_reason, ''), 4)) = 'HIGH'
    and (cl.is_archived is null or cl.is_archived = false)
    and not exists (
      select 1 from mv_excluded_items mex
       where mex.org_id = p_org and mex.item_id = cli.id
    )
  order by cr.item_id, cr.called_at desc;
$function$;
