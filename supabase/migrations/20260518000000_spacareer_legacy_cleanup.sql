-- ============================================================
-- スパキャリ基盤構築 Migration 1/5: 既存スパキャリ関連レコードのクリーンアップ
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md §12.2 - 基盤構築フェーズ
-- 目的: 旧スパキャリ設計（Dealsベース）のレコードを削除し、新仕様のテーブル群を
--       導入できる素地を整える。本番DB事前確認結果:
--         deals=0, customers=0, customer_sessions=0, payment_schedules=0,
--         session_templates=22（削除）, teams=2（削除）, team_members=13（削除）,
--         member_page_permissions=48（削除→次migrationで新8ページ再付与）,
--         member_engagements_career=17（残す。新仕様でも所属継続）
-- 既存テーブル定義は変更しない（ソーシング事業で使われているため）。
-- ============================================================

set local search_path = public, extensions;

-- payment_schedules（customer_id 経由）
delete from public.payment_schedules
where customer_id in (
  select id from public.customers
  where engagement_id in (select id from public.engagements where slug = 'spartia_career')
);

-- customer_sessions（customer_id 経由）
delete from public.customer_sessions
where customer_id in (
  select id from public.customers
  where engagement_id in (select id from public.engagements where slug = 'spartia_career')
);

-- session_templates（engagement_id 直接、本番22行）
delete from public.session_templates
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

-- customers（本番0行）
delete from public.customers
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

-- deals（本番0行）
delete from public.deals
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

-- team_members（teams 経由、本番13行）
delete from public.team_members
where team_id in (
  select id from public.teams
  where engagement_id in (select id from public.engagements where slug = 'spartia_career')
);

-- teams（本番2行：浅井チーム、瀬尾チーム）
delete from public.teams
where engagement_id in (select id from public.engagements where slug = 'spartia_career');

-- 旧3ページのページ権限を全削除（次のmigrationで新8ページをリビルド、本番48行）
delete from public.member_page_permissions where engagement_slug = 'spartia_career';

-- product_plans の spartia_career レコードはそのまま残す（将来の単一コース移行で再利用）
-- engagements の spartia_career 行はそのまま残す（新仕様で同じ slug を使う）
-- member_engagements の spartia_career 紐付けはそのまま残す（17名のトレーナー継承）
