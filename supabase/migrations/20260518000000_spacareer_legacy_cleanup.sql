-- ============================================================
-- スパキャリ基盤構築 Migration 1/5: 既存スパキャリ関連レコードのクリーンアップ
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md §12.2 - 基盤構築フェーズ
-- 目的: 旧スパキャリ設計（Dealsベース）のレコードを削除し、新仕様のテーブル群を
--       導入できる素地を整える。本番レコードは存在しない前提（壁打ち確認済）。
-- 既存テーブル定義は変更しない（ソーシング事業で使われているため）。
-- ============================================================

set local search_path = public, extensions;

-- 旧スパキャリ顧客系（spartia_career engagement の行のみ削除）
delete from public.payment_schedules
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

delete from public.customer_sessions
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

delete from public.session_templates
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

delete from public.customers
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

-- 旧スパキャリ商談・応募
delete from public.deals
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

-- 旧スパキャリチーム
delete from public.team_members
where team_id in (
  select id from public.teams
  where engagement_id in (select id from public.engagements where slug = 'spartia_career')
);

delete from public.teams
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

-- 旧スパキャリのページ権限を全削除（次のmigrationでリビルド）
delete from public.member_page_permissions where engagement_slug = 'spartia_career';

-- product_plans の spartia_career レコードはそのまま残す（将来の単一コース移行で再利用）
-- engagements の spartia_career 行はそのまま残す（新仕様で同じ slug を使う）
-- member_engagements の spartia_career 紐付けはそのまま残す（トレーナー継承用）
