-- 「除外」に理由の種類を持たせ、取り込み時の自動除外で他リストへ伝える除外を絞る（2026-10-05 むー様指示）
--   company   = 会社の事情（廃業・番号不使用・はっきり断られた など）→ 他リストへ伝える
--   client    = そのクライアントの条件外（売上・地域・業種など）       → 伝えない
--   duplicate = 同じリスト内の重複行の整理                            → 伝えない
--   NULL      = 理由不明（これまでの除外）。重複整理・温度感低の自動除外のメモでなければ伝える（むー様判断）
-- あわせて、別のリストで「アポ獲得」がある会社は、他で除外が付いていても外さない。
set lock_timeout = '5s';

alter table public.call_records
  add column if not exists exclude_scope text
  check (exclude_scope is null or exclude_scope in ('company', 'client', 'duplicate'));

comment on column public.call_records.exclude_scope is
  '除外の理由の種類。company=会社の事情（他リストへ伝える）/ client=クライアントの条件外 / duplicate=重複行の整理。NULL=理由不明の旧データ';

reset lock_timeout;

-- これまでの除外のうち、メモで見分けられるものに種類を付ける
update public.call_records set exclude_scope = 'duplicate'
 where status = '除外' and exclude_scope is null and memo like '取り込みが二重になったため重複行を除外%';
update public.call_records set exclude_scope = 'client'
 where status = '除外' and exclude_scope is null and memo like 'AI判定:温度感低%';
update public.call_records set exclude_scope = 'company'
 where status = '除外' and exclude_scope is null and memo like '他リスト「%」で除外済みのため取り込み時に自動除外';

create or replace function public.auto_exclude_known_excluded(p_list_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_org   uuid;
  v_count integer := 0;
begin
  select org_id into v_org from public.call_lists where id = p_list_id;
  if v_org is null then
    return 0;
  end if;

  if v_org is distinct from public.get_user_org_id() then
    raise exception 'auto_exclude_known_excluded: not authorized for this org';
  end if;

  create temporary table _auto_excl_matched on commit drop as
  with excluded_src as (
    -- 他リストで「除外」になっていて、その除外が他へ伝えてよい種類のもの
    select nc, np, min(src_list_name) as src_list_name
    from (
      select public.spanavi_norm_company(e.company) as nc,
             regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') as np,
             cl.name as src_list_name
      from public.call_list_items e
      join public.call_lists cl on cl.id = e.list_id
      where e.org_id = v_org
        and e.list_id <> p_list_id
        and e.call_status = '除外'
        and exists (
          select 1 from public.call_records r
          where r.item_id = e.id
            and r.status = '除外'
            and (
              r.exclude_scope = 'company'
              or (r.exclude_scope is null
                  and coalesce(r.memo, '') not like '取り込みが二重になったため重複行を除外%'
                  and coalesce(r.memo, '') not like 'AI判定:温度感低%')
            )
        )
    ) q
    where q.nc is not null
      and length(q.np) >= 10
    group by nc, np
  ),
  apo_co as (
    -- どこかのリストでアポが取れている会社は外さない
    select distinct public.spanavi_norm_company(a.company) as nc,
           regexp_replace(coalesce(a.phone, ''), '[^0-9]', '', 'g') as np
    from public.call_records r
    join public.call_list_items a on a.id = r.item_id
    where r.org_id = v_org and r.status = 'アポ獲得'
  )
  select i.id, i.org_id, i.list_id, s.src_list_name
  from public.call_list_items i
  join excluded_src s
    on public.spanavi_norm_company(i.company) = s.nc
   and regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g') = s.np
  where i.list_id = p_list_id
    and coalesce(i.is_excluded, false) = false
    and coalesce(i.call_status, '') <> '除外'
    and not exists (select 1 from apo_co p where p.nc = s.nc and p.np = s.np);

  select count(*) into v_count from _auto_excl_matched;
  if v_count = 0 then
    return 0;
  end if;

  insert into public.call_records (org_id, item_id, list_id, round, status, memo, called_at, getter_name, exclude_scope)
  select org_id, id, list_id, 1, '除外',
         '他リスト「' || coalesce(src_list_name, '?') || '」で除外済みのため取り込み時に自動除外',
         now(), '自動除外', 'company'
  from _auto_excl_matched;

  update public.call_list_items i
  set is_excluded    = true,
      call_status    = '除外',
      exclude_reason = '他リスト「' || coalesce(m.src_list_name, '?') || '」で除外済み（取り込み時自動除外）'
  from _auto_excl_matched m
  where i.id = m.id;

  return v_count;
end;
$function$;
