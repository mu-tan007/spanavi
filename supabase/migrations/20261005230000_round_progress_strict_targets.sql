-- 周回の対象から外すのは「もうかけない」会社だけ（アポ獲得・除外）。断り・受付ブロックも次の周の対象（2026-10-05 むー様）
-- 本番には apply_migration（round_progress_strict_targets）で適用済み。中身は round_progress の targets 節だけ変更
set lock_timeout = '5s';
create or replace function public.round_progress(p_list_id uuid)
returns table (round integer, targets integer, done integer, completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  with recs as (
    select item_id, round, status, called_at from call_records
     where list_id = p_list_id and round is not null and item_id is not null
  ),
  last_status as (
    select distinct on (item_id, round) item_id, round, status
      from recs order by item_id, round, called_at desc
  ),
  first_call as (
    select distinct on (item_id, round) item_id, round, called_at
      from recs order by item_id, round, called_at
  ),
  targets as (
    select 1 as round, i.id as item_id from call_list_items i
     where i.list_id = p_list_id
       and (not coalesce(i.is_excluded, false) or exists (select 1 from recs r where r.item_id = i.id))
    union all
    select s.round + 1, s.item_id from last_status s
      join call_list_items i on i.id = s.item_id
     where s.status not in ('アポ獲得', '除外')
       and not coalesce(i.is_excluded, false)
  ),
  joined as (
    select t.round, t.item_id, f.called_at
      from targets t left join first_call f on f.item_id = t.item_id and f.round = t.round
  ),
  agg as (
    select j.round, count(*)::int as targets, count(j.called_at)::int as done from joined j group by j.round
  ),
  nth as (
    select j.round, j.called_at, row_number() over (partition by j.round order by j.called_at) as rn
      from joined j where j.called_at is not null
  )
  select a.round, a.targets, a.done,
         (select n.called_at from nth n where n.round = a.round and n.rn = ceil(a.targets * 0.9)::int)
    from agg a
   where a.done > 0
   order by a.round
$$;
revoke all on function public.round_progress(uuid) from public, anon, authenticated;
grant execute on function public.round_progress(uuid) to service_role;
