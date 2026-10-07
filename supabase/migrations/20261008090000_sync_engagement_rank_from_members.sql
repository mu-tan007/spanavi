-- 営業代行のメンバーのページのランク（member_engagements.rank_id）が、報酬のランク（members.rank：累計売上で上がる）と
-- ずれていた（浅井・瀬尾はスパルタン 26% なのにページではプレイヤー）。2026-10-08
-- 正は members.rank。同じ名前の engagement_ranks に合わせ、以後は members.rank が変わるたびに追従させる。

create or replace function public.sync_engagement_rank_from_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 役員（代表取締役・取締役）はランクの対象外
  if new.rank is null or new.rank = 'student' or coalesce(new.position, '') in ('代表取締役', '取締役') then return new; end if;
  update member_engagements me
     set rank_id = er.id, updated_at = now()
    from engagement_ranks er
   where me.member_id = new.id
     and er.engagement_id = me.engagement_id
     and er.name = new.rank
     and me.rank_id is distinct from er.id;
  return new;
end $$;

drop trigger if exists trg_sync_engagement_rank on public.members;
create trigger trg_sync_engagement_rank
  after insert or update of rank on public.members
  for each row execute function public.sync_engagement_rank_from_member();

-- いまのずれを直す（ランク未設定の人も members.rank に合わせる）
update member_engagements me
   set rank_id = er.id, updated_at = now()
  from members m, engagement_ranks er
 where m.id = me.member_id
   and er.engagement_id = me.engagement_id
   and er.name = m.rank
   and coalesce(m.position, '') not in ('代表取締役', '取締役')
   and me.rank_id is distinct from er.id;
