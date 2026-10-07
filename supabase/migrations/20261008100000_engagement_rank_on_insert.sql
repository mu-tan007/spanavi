-- 事業への所属を作ったときも、ランク未指定なら members.rank（報酬のランク）に合わせる（2026-10-08）
-- メンバー追加画面は「members.rank を入れる → 所属を作る」の順なので、members 側のトリガだけでは届かない
create or replace function public.fill_engagement_rank_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rank_id is null then
    select er.id into new.rank_id
      from members m join engagement_ranks er on er.engagement_id = new.engagement_id and er.name = m.rank
     where m.id = new.member_id
       and coalesce(m.position, '') not in ('代表取締役', '取締役')
     limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_fill_engagement_rank on public.member_engagements;
create trigger trg_fill_engagement_rank
  before insert on public.member_engagements
  for each row execute function public.fill_engagement_rank_on_insert();
