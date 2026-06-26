-- ============================================================
-- スパキャリ「採用管理(recruiting)」ページの閲覧権限を初期登録
-- ----------------------------------------------------------------
-- member_page_permissions は「行が存在 = そのページ閲覧可」方式。
-- 新ページ recruiting を追加した際、権限行のシードを忘れると
-- 画面遷移ガード(canViewPage)で弾かれ顧客一覧に戻される。
-- 既存の customers ページを閲覧できるメンバー全員に recruiting も付与する。
-- 冪等（既に付与済みならスキップ）。
-- ============================================================

set local search_path = public, extensions;

insert into public.member_page_permissions (org_id, member_id, engagement_slug, page_key)
select c.org_id, c.member_id, 'spartia_career', 'recruiting'
from public.member_page_permissions c
where c.engagement_slug = 'spartia_career'
  and c.page_key = 'customers'
  and not exists (
    select 1 from public.member_page_permissions r
    where r.engagement_slug = 'spartia_career'
      and r.page_key = 'recruiting'
      and r.member_id = c.member_id
      and r.org_id = c.org_id
  );
