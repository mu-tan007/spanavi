set local search_path = public, extensions;

-- スパキャリ管理画面に新タブ「トレーナー別予定(trainer_schedule)」「セッション記録(session_records)」を追加。
-- 非adminトレーナーにも表示するため、既存の「セッション管理(sessions)」権限保有者へ同権限をシードする。
-- むー様指示 2026-07-10。
insert into public.member_page_permissions (org_id, member_id, engagement_slug, page_key)
select p.org_id, p.member_id, p.engagement_slug, k.page_key
from public.member_page_permissions p
cross join (values ('trainer_schedule'), ('session_records')) as k(page_key)
where p.engagement_slug = 'spartia_career' and p.page_key = 'sessions'
  and not exists (
    select 1 from public.member_page_permissions e
    where e.member_id = p.member_id
      and e.engagement_slug = 'spartia_career'
      and e.page_key = k.page_key
  );
