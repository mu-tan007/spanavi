-- business_overview_member_performance の表示対象メンバーの絞り込みを修正。
--
-- 背景: 対象メンバーが `m.team in ('成尾', '高橋')` とチーム名べた書きで固定されていた。
--       2026年8月のチーム改編で成尾チーム・高橋チームの在籍者が 0 になったため、
--       アナリティクス「チーム比較」表と事業俯瞰のメンバー表が丸ごと空になった。
--       現行の浅井チーム・瀬尾チームは 5月から稼働しているが、この条件のせいで
--       改編前から一度も表に出ていなかった。
--       加えて `split_part(m.name,' ',1) <> m.team` でチーム名と姓が一致する行を
--       落としており、リーダー本人（浅井・瀬尾）の架電数が常に非表示だった。
--
-- 方針: 対象メンバーを次のいずれかに変更する。チーム名も在籍状態も直書きしない。
--       (1) 在籍中でチームが設定されているメンバー … 実績ゼロでも表に出す
--       (2) 期間内に架電・シフト・稼働のいずれかの実績があるメンバー
--           … 退職者や、チーム未設定のメンバー（「その他」に集約）も過去月で追える
--       スパキャリ受講生など team 未設定で架電しない在籍者は (1)(2) どちらにも
--       該当しないため、これまで通り表に出ない。
--       リーダー除外条件は撤廃する。集計ロジック・返却列は一切変更しない。

set local search_path = public, extensions;
set local lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.business_overview_member_performance(p_from date, p_to date)
 RETURNS TABLE(member_id uuid, member_name text, member_email text, team text, rank text, shift_hours numeric, worked_hours numeric, call_count integer, keyman_connect_count integer, keyman_connect_rate numeric, apo_count integer, apo_rate numeric, last_roleplay_at timestamp with time zone, next_roleplay_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org_id uuid := public.get_user_org_id();
  v_keyman_labels text[] := public._perf_keyman_connect_labels();
  -- 日付を JST の暦日として解釈した集計枠 [v_from, v_to)。
  v_from timestamptz := (p_from::timestamp AT TIME ZONE 'Asia/Tokyo');
  v_to   timestamptz := ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Tokyo');
begin
  return query
  with shift_agg as (
    select s.member_id,
      sum(extract(epoch from (s.end_time - s.start_time)) / 3600.0) as hours
    from public.shifts s
    where s.org_id = v_org_id
      and s.shift_date between p_from and p_to
    group by s.member_id
  ),
  worked_agg as (
    select m.id as member_id,
      sum(
        extract(epoch from (coalesce(cs.finished_at, cs.last_called_at, cs.started_at) - cs.started_at)) / 3600.0
      ) as hours
    from public.call_sessions cs
    join public.members m on m.name = cs.caller_name and m.org_id = cs.org_id
    where cs.org_id = v_org_id
      and cs.started_at >= v_from
      and cs.started_at < v_to
    group by m.id
  ),
  call_agg as (
    select m.id as member_id,
      count(*)::integer as total,
      count(*) filter (where cr.status = any (v_keyman_labels))::integer as keyman_connect,
      count(*) filter (where cr.status = 'アポ獲得')::integer as apo
    from public.call_records cr
    join public.members m on m.name = cr.getter_name and m.org_id = cr.org_id
    where cr.org_id = v_org_id
      and cr.called_at >= v_from
      and cr.called_at < v_to
      and cr.getter_name is not null
      and cr.getter_name <> ''
    group by m.id
  ),
  -- 在籍かつチーム所属のメンバー、または期間内に実績のあるメンバー（退職者含む）
  target_members as (
    select m.id, m.name, m.email, m.team, m.rank, m.user_id
    from public.members m
    left join call_agg ca on ca.member_id = m.id
    left join shift_agg sa on sa.member_id = m.id
    left join worked_agg wa on wa.member_id = m.id
    where m.org_id = v_org_id
      and (
        (m.is_active = true and m.team is not null and m.team <> '')
        or ca.member_id is not null
        or sa.member_id is not null
        or wa.member_id is not null
      )
  ),
  roleplay_done_agg as (
    select rp.user_id, max(rp.created_at) as last_at
    from public.roleplay_sessions rp
    where rp.org_id = v_org_id
    group by rp.user_id
  ),
  roleplay_next_agg as (
    select rb.user_id, min(rb.start_iso::timestamptz) as next_at
    from public.roleplay_bookings rb
    where rb.start_iso is not null
      and rb.start_iso::timestamptz >= now()
    group by rb.user_id
  )
  select
    t.id as member_id,
    t.name as member_name,
    t.email as member_email,
    t.team,
    t.rank,
    coalesce(sa.hours, 0)::numeric as shift_hours,
    coalesce(wa.hours, 0)::numeric as worked_hours,
    coalesce(ca.total, 0) as call_count,
    coalesce(ca.keyman_connect, 0) as keyman_connect_count,
    case when coalesce(ca.total, 0) > 0
      then round(coalesce(ca.keyman_connect, 0)::numeric * 100 / ca.total, 1)
      else 0 end as keyman_connect_rate,
    coalesce(ca.apo, 0) as apo_count,
    case when coalesce(ca.total, 0) > 0
      then round(coalesce(ca.apo, 0)::numeric * 100 / ca.total, 2)
      else 0 end as apo_rate,
    rd.last_at as last_roleplay_at,
    rn.next_at as next_roleplay_at
  from target_members t
  left join shift_agg sa on sa.member_id = t.id
  left join worked_agg wa on wa.member_id = t.id
  left join call_agg ca on ca.member_id = t.id
  left join roleplay_done_agg rd on rd.user_id = t.user_id
  left join roleplay_next_agg rn on rn.user_id = t.user_id
  order by t.team, t.name;
end;
$function$;
