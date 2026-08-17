-- AI断り分析で温度感LOWと判定された企業を、クライアント単位で自動的に架電対象外にする。
--
-- 背景:
--   架電対象から本当に外す実体は mv_excluded_items テーブル（名前は mv だが実テーブル）。
--   ここに (org_id, item_id) が入ると mv_smart_queue_base から落ち、スマートキューの
--   全パネルと smart_queue_keyman_rejections から消える。
--   call_list_items.is_excluded は架電画面の表示用フラグで、絞り込みには使われていなかったため、
--   両方に書き込む。

set lock_timeout = '5s';

alter table clients
  add column if not exists auto_exclude_low_rejection boolean not null default false;

comment on column clients.auto_exclude_low_rejection is
  'AI断り分析で温度感LOWと判定された企業を自動で架電対象外にする';

-- AI 分析は rejection_reason を後から UPDATE で書き込むため、status ではなく
-- rejection_reason の変更を拾う。既存の sync_excluded_items_from_call_record() と同じ作法。
create or replace function sync_low_rejection_exclusion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_enabled boolean;
begin
  if new.item_id is null then return new; end if;
  if new.status <> 'キーマン断り' then return new; end if;
  if coalesce(new.rejection_reason, '') !~ '^LOW' then return new; end if;

  select coalesce(c.auto_exclude_low_rejection, false) into v_enabled
  from call_list_items cli
  join call_lists cl on cl.id = cli.list_id
  join clients c on c.id = cl.client_id
  where cli.id = new.item_id;

  if not coalesce(v_enabled, false) then return new; end if;

  -- 既にアポ獲得/除外で入っている行は上書きしない
  insert into mv_excluded_items (org_id, item_id, status, excluded_at)
  values (new.org_id, new.item_id, 'AI除外:温度感低', coalesce(new.called_at, now()))
  on conflict (org_id, item_id) do nothing;

  update call_list_items
     set is_excluded = true,
         exclude_reason = 'AI判定:温度感低'
   where id = new.item_id
     and (is_excluded is distinct from true or exclude_reason is distinct from 'AI判定:温度感低');

  return new;
end;
$$;

drop trigger if exists trg_sync_low_rejection_exclusion on call_records;
create trigger trg_sync_low_rejection_exclusion
  after insert or update of rejection_reason on call_records
  for each row execute function sync_low_rejection_exclusion();

-- 再アプローチ候補タブから「架電対象外」になった企業を落とす
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
      select 1 from mv_excluded_items mex
       where mex.org_id = cl.org_id and mex.item_id = cli.id
    )
  order by cr.called_at desc;
$function$;

-- 適用対象（株式会社SECURITY BRIDGE は同名2件あるため両方）と既存分のバックフィルは
-- 本番で実行済み。他クライアントへ広げる場合は clients.auto_exclude_low_rejection を
-- true にしたうえで、同じ条件の insert/update を流す。
