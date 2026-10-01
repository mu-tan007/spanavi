-- 温度感LOWの自動除外で、架電結果にも「除外」を1件足す（2026-10-01 むー様指示・SECURITY BRIDGE榎本様の依頼）
-- 従来は mv_excluded_items と call_list_items.is_excluded だけを立て、ステータスは「キーマン断り」のまま残っていた。
-- 対象は clients.auto_exclude_low_rejection = true のクライアントだけ（現在は SECURITY BRIDGE のみ）。
-- 足した行は memo = 'AI判定:温度感低により自動除外' を目印に一括で戻せる。担当者の架電数に乗らないよう getter_name は null。

set lock_timeout = '5s';

create or replace function public.sync_low_rejection_exclusion()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_enabled boolean;
  v_list_id uuid;
begin
  if new.item_id is null then return new; end if;
  if new.status <> 'キーマン断り' then return new; end if;
  if coalesce(new.rejection_reason, '') !~ '^LOW' then return new; end if;

  select coalesce(c.auto_exclude_low_rejection, false), cli.list_id into v_enabled, v_list_id
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

  -- 架電結果にも「除外」を足す。再分析で何度呼ばれても1件だけ。アポ獲得済みには足さない
  if not exists (
    select 1 from call_records
     where item_id = new.item_id and status in ('除外', 'アポ獲得')
  ) then
    insert into call_records (item_id, list_id, org_id, round, status, called_at, memo)
    select new.item_id, coalesce(new.list_id, v_list_id), new.org_id,
           coalesce(max(round), 0) + 1, '除外', now(), 'AI判定:温度感低により自動除外'
      from call_records
     where item_id = new.item_id;
  end if;

  return new;
end;
$function$;

-- 既存分：稼働中（アーカイブしていない）リストの温度感LOWに「除外」を足す
insert into call_records (item_id, list_id, org_id, round, status, called_at, memo)
select cr.item_id, cli.list_id, cli.org_id,
       (select coalesce(max(x.round), 0) + 1 from call_records x where x.item_id = cr.item_id),
       '除外', now(), 'AI判定:温度感低により自動除外'
  from (select distinct item_id from call_records
         where status = 'キーマン断り' and rejection_reason ~ '^LOW') cr
  join call_list_items cli on cli.id = cr.item_id
  join call_lists cl on cl.id = cli.list_id
  join clients c on c.id = cl.client_id
 where c.auto_exclude_low_rejection
   and not coalesce(cl.is_archived, false)
   and not exists (
     select 1 from call_records e
      where e.item_id = cr.item_id and e.status in ('除外', 'アポ獲得')
   );
