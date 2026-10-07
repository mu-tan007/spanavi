-- M&Aニュース（ライブラリーの下・2026-10-07 むー様決定）：ライブラリーを見られる人は M&Aニュースも見られる
insert into public.member_page_permissions (org_id, member_id, engagement_slug, page_key)
select org_id, member_id, engagement_slug, 'ma_news'
from public.member_page_permissions
where page_key = 'library'
on conflict (member_id, engagement_slug, page_key) do nothing;
