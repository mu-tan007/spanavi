-- =====================================================================
-- Phase 1-A 完全ロールバックSQL (2026-05-26 更新版)
-- =====================================================================
-- 実行タイミング: Phase 1-A 実行後に何か問題が起きた場合のみ
-- 影響: Phase 1-A で追加した分を全て元に戻す
-- 注意:
--   - 物理削除した3 engagement (SaaS買い手/IFA買い手/IFA売り手) は
--     紐付き業務データゼロを確認済 → 復元しない方針
--     必要なら .local-snapshots/2026-05-25_phase1a_pre.json から手動再投入
--   - Phase 1-A 以降に行った新規アポ・新規リスト・新規クライアントは
--     このSQLでは消えない(別途確認の上で対処)
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

-- ③ SaaS リード獲得テンプレのリネームを元に戻す
UPDATE appointment_report_templates
SET name = '売り手ソーシング 標準',
    description = NULL
WHERE engagement_id = (SELECT id FROM engagements WHERE slug = 'seller_sourcing_saas')
  AND name = 'SaaS リード獲得 アポ取得報告';

-- ④ 株式会社がんばの industry 補正を元に戻す
UPDATE clients SET industry = '' WHERE id = '69fd6233-1643-45dd-bec5-e3803f68fe76';

-- ⑤ SaaS engagement slug 統一を元に戻す (2026-05-26 追加)
UPDATE engagements SET slug = 'seller_sourcing_saas' WHERE slug = 'lead_generation_saas';

-- ⑥ クライアント開拓テンプレ統一リネームを元に戻す (2026-05-26 追加)
--   ※ M&A配下と人材配下は元の名前が異なっていたため、engagement_id で識別して個別に戻す
UPDATE appointment_report_templates
SET name = 'M&A クライアント開拓 アポ取得報告'
WHERE name = 'クライアント開拓 アポ取得報告'
  AND engagement_id IN (
    SELECT id FROM engagements WHERE slug IN ('client_acquisition', 'client_acquisition_saas', 'client_acquisition_ifa')
  );
UPDATE appointment_report_templates
SET name = '人材 クライアント開拓 アポ取得報告'
WHERE name = 'クライアント開拓 アポ取得報告'
  AND engagement_id = (SELECT id FROM engagements WHERE slug = 'client_acquisition_jinzai');

COMMIT;

-- 検証クエリ:
-- SELECT name, slug FROM business_categories WHERE product_id IN (SELECT id FROM products WHERE slug='sales_agency');
--   → M&A / SaaS / IFA の3件のみ
-- SELECT industry FROM clients WHERE id='69fd6233-1643-45dd-bec5-e3803f68fe76';
--   → '' (空文字)
