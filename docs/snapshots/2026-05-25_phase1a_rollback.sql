-- =====================================================================
-- Phase 1-A 完全ロールバックSQL
-- =====================================================================
-- 実行タイミング: Phase 1-A 実行後に何か問題が起きた場合のみ
-- 影響: Phase 1-A で追加/変更した分を全て元に戻す
-- 注意: Phase 1-A 以降に行った新規アポ・新規リスト・新規クライアントは
--       このSQLでは消えない(別途確認の上で対処すること)
-- =====================================================================

BEGIN;

-- ① 人材商材配下の新規追加分を削除
DELETE FROM appointment_report_templates
WHERE engagement_id IN (
  SELECT id FROM engagements
  WHERE slug IN ('lead_generation_jinzai', 'client_acquisition_jinzai')
);
DELETE FROM engagements WHERE slug IN ('lead_generation_jinzai', 'client_acquisition_jinzai');
DELETE FROM business_categories WHERE slug = 'jinzai';

-- ② IFA「リード獲得」追加分を削除
DELETE FROM appointment_report_templates
WHERE engagement_id IN (SELECT id FROM engagements WHERE slug = 'lead_generation_ifa');
DELETE FROM engagements WHERE slug = 'lead_generation_ifa';

-- ③ IFA 売り手ソーシング を archived化したのを active に戻す
UPDATE engagements SET status = 'active' WHERE slug = 'seller_sourcing_ifa';

-- ④ SaaS リード獲得用に新規作成したテンプレを削除
DELETE FROM appointment_report_templates WHERE name = 'SaaS リード獲得 アポ取得報告';

-- ⑤ 株式会社がんばの industry 補正を元に戻す
UPDATE clients SET industry = '' WHERE id = '69fd6233-1643-45dd-bec5-e3803f68fe76';

COMMIT;

-- 検証クエリ:
-- SELECT name, slug FROM business_categories WHERE product_id IN (SELECT id FROM products WHERE slug='sales_agency');
--   → M&A / SaaS / IFA の3件のみが返ること
-- SELECT name, slug, status FROM engagements WHERE category_id IN (SELECT id FROM business_categories WHERE slug='ifa');
--   → 売り手ソーシング(active) / 買い手マッチング(archived) / クライアント開拓(active) の3件
-- SELECT industry FROM clients WHERE id='69fd6233-1643-45dd-bec5-e3803f68fe76';
--   → '' (空文字)
