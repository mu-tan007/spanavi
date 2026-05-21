-- =====================================================================
-- アポ取得報告テンプレ：複数共存対応（unique制約撤去）
-- ---------------------------------------------------------------------
-- 経緯:
--   1スコープに1テンプレの制約だと、同じタイプ内でも用途別の複数
--   テンプレ（例: アポ取得報告 + ヒアリング報告）を持てない。
--   名前で区別する前提でユニーク制約を撤去する。
-- =====================================================================

set local search_path = public, extensions;

drop index if exists public.apt_templates_engagement_uniq;
drop index if exists public.apt_templates_client_uniq;
drop index if exists public.apt_templates_list_uniq;
