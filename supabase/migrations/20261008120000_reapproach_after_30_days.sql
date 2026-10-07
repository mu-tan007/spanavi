-- キャンセル（先方都合）・リスケ中のアポ先を、面談日から30日で架電の対象に戻す（2026-10-08 むー様決定）
--  ・キャンセルは「クライアント都合（client）」「先方都合（prospect）」を区分する。クライアント都合は外したまま
--  ・先方都合のキャンセルと、30日たっても日程の決まらないリスケ中は、リストがアーカイブでなければ誰でもかけられる
--  ・戻した行には reapproach_at と元のアポの情報を残し、架電ページで「再アプローチ」と出す

alter table public.appointments add column if not exists cancel_type text;
alter table public.appointments drop constraint if exists appointments_cancel_type_check;
alter table public.appointments add constraint appointments_cancel_type_check check (cancel_type is null or cancel_type in ('client', 'prospect'));
comment on column public.appointments.cancel_type is 'キャンセルの区分：client＝クライアント都合／prospect＝先方（アポ先）都合';

alter table public.call_list_items add column if not exists reapproach_at timestamptz;
alter table public.call_list_items add column if not exists reapproach_appo_id uuid;
alter table public.call_list_items add column if not exists reapproach_note text;
comment on column public.call_list_items.reapproach_at is '再アプローチとして架電の対象に戻した日時。これより前の「アポ獲得」の記録では除外しない';

-- 既存のキャンセル：理由の文から分かるものだけ振り分ける（分からないものは空のまま＝戻さない）
update public.appointments set cancel_type = 'client'
 where status = 'キャンセル' and cancel_type is null and coalesce(cancel_reason, '') ~ '(クライアント|仲介(会社|側)|弊社都合|御社都合)';
update public.appointments set cancel_type = 'prospect'
 where status = 'キャンセル' and cancel_type is null and coalesce(cancel_reason, '') ~ '(先方|社長|代表|お客様|相手|体調|急用|多忙|忘れ)';

-- 毎朝動かす：対象のアポ先の行を架電の対象に戻す
create or replace function public.release_reapproach_items()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  for r in
    select a.id as appo_id, a.item_id, a.org_id, a.status, a.cancel_type, a.cancel_reason,
           (a.meeting_date at time zone 'Asia/Tokyo')::date as meet_day
      from appointments a
      join call_list_items i on i.id = a.item_id
      join call_lists l on l.id = i.list_id
     where a.item_id is not null
       and coalesce(l.is_archived, false) = false
       and ((a.status = 'キャンセル' and a.cancel_type = 'prospect') or a.status = 'リスケ中')
       and a.meeting_date is not null
       and (a.meeting_date at time zone 'Asia/Tokyo')::date <= ((now() at time zone 'Asia/Tokyo')::date - 30)
       and i.reapproach_appo_id is distinct from a.id
       -- 同じ行に、このアポより新しい有効なアポがあれば戻さない
       and not exists (select 1 from appointments b where b.item_id = a.item_id and b.id <> a.id
                        and b.status in ('アポ取得', '事前確認済', '面談済') and b.created_at > a.created_at)
  loop
    update call_list_items
       set reapproach_at = now(), reapproach_appo_id = r.appo_id, is_excluded = false,
           call_status = '再アプローチ',
           reapproach_note = format('元のアポ %s（%s）%s', to_char(r.meet_day, 'YYYY/MM/DD'),
             case when r.status = 'リスケ中' then 'リスケのまま30日' else 'キャンセル・先方都合' end,
             case when coalesce(r.cancel_reason, '') <> '' then '：' || left(r.cancel_reason, 80) else '' end)
     where id = r.item_id;
    delete from mv_excluded_items where item_id = r.item_id and org_id = r.org_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.release_reapproach_items() from public, anon, authenticated;

-- 順に架電するキューの直前チェック：再アプローチで戻した行は「アポ獲得」で飛ばさない
create or replace function public.smart_queue_call_check(p_item_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with my_org as (select get_user_org_id() as org_id),
  me as (select name from members where user_id = auth.uid() and org_id = (select org_id from my_org) limit 1),
  jst_today_start as (
    select ((date_trunc('day', now() at time zone 'Asia/Tokyo'))::timestamp at time zone 'Asia/Tokyo') as ts
  ),
  jst_tomorrow_start as (
    select ((date_trunc('day', now() at time zone 'Asia/Tokyo') + interval '1 day')::timestamp at time zone 'Asia/Tokyo') as ts
  ),
  item as (select reapproach_at from call_list_items where id = p_item_id),
  latest as (
    select status, getter_name, called_at
    from call_records
    where org_id = (select org_id from my_org) and item_id = p_item_id
    order by round desc, called_at desc
    limit 1
  ),
  today_others as (
    select distinct getter_name
    from call_records
    where org_id = (select org_id from my_org) and item_id = p_item_id
      and called_at >= (select ts from jst_today_start)
      and called_at <  (select ts from jst_tomorrow_start)
      and getter_name is not null
      and getter_name <> coalesce((select name from me), '')
  )
  select jsonb_build_object(
    'latest_status', case when (select reapproach_at from item) is not null
                           and (select called_at from latest) <= (select reapproach_at from item)
                          then '再アプローチ' else (select status from latest) end,
    'latest_getter',    (select getter_name from latest),
    'latest_called_at', (select called_at from latest),
    'today_other_getters', coalesce((select jsonb_agg(getter_name) from today_others), '[]'::jsonb)
  );
$function$;

-- 毎朝6時（日本時間）に戻す
select cron.unschedule('release-reapproach-items') where exists (select 1 from cron.job where jobname = 'release-reapproach-items');
select cron.schedule('release-reapproach-items', '0 21 * * *', 'select public.release_reapproach_items()');
