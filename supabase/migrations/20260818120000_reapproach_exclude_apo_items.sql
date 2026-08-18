-- 「再アプローチ候補」から、その後アポが取れた企業を外す。
--
-- 20260818090000 で除外フィルタを全部外したが、アポ獲得済みの企業は
-- 再アプローチの対象ではないため、そこだけ改めて落とす（むー様指示・2026-08-18）。
-- 「架電対象外にしたから消える」のではなく「アポが取れたから消える」という判定にする。
--
-- 判定はアイテム単位で、キーマン断りより後かどうかは問わず
-- 'アポ獲得' の架電記録が1件でもあれば候補から外す（本番で該当16アイテム）。

create or replace function public.client_keyman_rejections(p_client_id uuid, p_org_id uuid)
returns table(call_id uuid, called_at timestamp with time zone, rejection_reason text, getter_name text,
              list_id uuid, list_name text, list_industry text, item_id uuid, company text,
              phone text, revenue text, employees text)
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select
    cr.id            as call_id,
    cr.called_at,
    cr.rejection_reason,
    cr.getter_name,
    cl.id            as list_id,
    cl.name          as list_name,
    cl.industry      as list_industry,
    cli.id           as item_id,
    cli.company,
    cli.phone,
    cli.revenue,
    cli.employees
  from call_records cr
  join call_list_items cli on cli.id = cr.item_id
  join call_lists      cl  on cl.id  = cli.list_id
  where cl.client_id = p_client_id
    and cl.org_id    = p_org_id
    and cr.status    = 'キーマン断り'
    and cr.rejection_reason is not null
    and cr.rejection_reason <> ''
    and not exists (
      select 1 from call_records ap
       where ap.item_id = cli.id
         and ap.status  = 'アポ獲得'
    )
  order by cr.called_at desc;
$function$;
