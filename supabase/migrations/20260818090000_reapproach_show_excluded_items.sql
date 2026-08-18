-- 「再アプローチ候補」タブに、架電対象外にした企業も再び表示する。
--
-- 背景:
--   20260817140000_auto_exclude_low_rejection.sql で client_keyman_rejections に
--   「mv_excluded_items に入っている企業は出さない」条件を足した。
--   その結果、温度感LOWの自動除外（SECURITY BRIDGE）で外した企業が
--   クライアントポータルの再アプローチ候補から消えてしまった。
--
--   架電対象から外すこと（mv_excluded_items / call_list_items.is_excluded）はそのまま維持し、
--   一覧としての「再アプローチ候補」には出す方針に戻す。
--   = 2026-08-17 以前の定義（除外フィルタなし）へ戻す。
--
--   なお架電キュー側（mv_smart_queue_base 経由の smart_queue_keyman_rejections 等）は
--   従来どおり mv_excluded_items で落ちるため、除外の効き目は変わらない。

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
  order by cr.called_at desc;
$function$;
