-- リストの業種の内訳（上の段の業種ごとの社数）。リストの詳細の「つながりやすい時間」に使う（2026-10-09）
create or replace function public.list_industry_mix(p_list_id uuid)
returns table (grp text, n integer)
language sql stable security definer set search_path = public as $$
  select i.industry_group, count(*)::int
  from call_list_items i join call_lists l on l.id = i.list_id
  where i.list_id = p_list_id and l.org_id = public.get_user_org_id() and i.industry_group is not null
  group by 1 order by 2 desc
$$;
grant execute on function public.list_industry_mix(uuid) to authenticated;
