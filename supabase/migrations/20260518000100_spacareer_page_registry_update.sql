-- ============================================================
-- スパキャリ基盤構築 Migration 2/5: ページレジストリ更新（_all_page_keys）
-- ----------------------------------------------------------------
-- 仕様書: tasks/spacareer-spec.md §3.2 - 運営ダッシュボード 8画面
-- 目的: 旧スパキャリ3ページ（applications / deals_career / members_career）を
--       新仕様の運営ダッシュボード8ページに置き換える。
--       受講生（student）はクライアントポータルのみアクセスし本テーブルでは管理しない。
-- ============================================================

set local search_path = public, extensions;

-- ページキーマスター関数を更新（旧3ページ削除＋新8ページ追加）
create or replace function public._all_page_keys()
returns table(engagement_slug text, page_key text)
language sql
immutable
as $$
  values
    -- seller_sourcing（既存維持）
    ('seller_sourcing', 'dashboard'),
    ('seller_sourcing', 'lists'),
    ('seller_sourcing', 'search'),
    ('seller_sourcing', 'live'),
    ('seller_sourcing', 'recall'),
    ('seller_sourcing', 'incoming'),
    ('seller_sourcing', 'appo'),
    ('seller_sourcing', 'precheck'),
    ('seller_sourcing', 'deals'),
    ('seller_sourcing', 'stats'),
    ('seller_sourcing', 'library'),
    ('seller_sourcing', 'edu_roleplay'),
    ('seller_sourcing', 'members'),
    ('seller_sourcing', 'crm'),
    ('seller_sourcing', 'payroll'),
    ('seller_sourcing', 'shift'),
    -- spartia_career / スパキャリ（運営ダッシュボード 8ページ）
    ('spartia_career', 'customers'),         -- 顧客一覧（+ 個人ページ）
    ('spartia_career', 'sessions'),          -- セッション管理
    ('spartia_career', 'homework'),          -- 事前課題管理
    ('spartia_career', 'social_style'),      -- ソーシャルスタイル診断管理
    ('spartia_career', 'ai_courses'),        -- AI講座管理
    ('spartia_career', 'templates'),         -- テンプレート管理
    ('spartia_career', 'analytics'),         -- 分析レポート
    ('spartia_career', 'settings')           -- 設定
$$;

-- 既存メンバーの旧ページ権限を新ページ権限にリビルド
-- spartia_career engagement に所属するアクティブメンバー全員に新8ページ権限を付与
insert into public.member_page_permissions (org_id, member_id, engagement_slug, page_key)
select m.org_id, m.id, p.engagement_slug, p.page_key
from public.members m
join public.member_engagements me on me.member_id = m.id
join public.engagements e on e.id = me.engagement_id and e.slug = 'spartia_career'
join public._all_page_keys() p on p.engagement_slug = 'spartia_career'
where m.is_active = true
on conflict (member_id, engagement_slug, page_key) do nothing;

comment on function public._all_page_keys() is
  'ページキーマスター（フロント src/constants/pageRegistry.js と同期）。
  スパキャリ運営ダッシュボードの8ページ + ソーシング既存16ページを管理。
  受講生（student）はクライアントポータル専用で本マスターでは扱わない。';
