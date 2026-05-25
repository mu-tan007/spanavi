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

-- ⑦ クライアント開拓テンプレの outsourcing_experience 商材別ラベルを元に戻す (2026-05-26 追加 B)
UPDATE appointment_report_templates
SET schema = (
  SELECT jsonb_agg(
    CASE WHEN s->>'key' = 'outsourcing_experience'
      THEN s || jsonb_build_object('label', 'M&Aテレアポの外注経験はあるか')
      ELSE s END
  ) FROM jsonb_array_elements(schema) s
),
ai_prompt = replace(replace(replace(replace(ai_prompt,
  'M&A向けテレアポ', 'M&Aテレアポ'),
  'SaaS向けテレアポ', 'M&Aテレアポ'),
  'IFA向けテレアポ', 'M&Aテレアポ'),
  '人材紹介向けテレアポ', 'M&Aテレアポ'),
body_template = replace(replace(replace(replace(body_template,
  'M&A向けテレアポの外注経験', 'M&Aテレアポの外注経験はあるか'),
  'SaaS向けテレアポの外注経験', 'M&Aテレアポの外注経験はあるか'),
  'IFA向けテレアポの外注経験', 'M&Aテレアポの外注経験はあるか'),
  '人材紹介向けテレアポの外注経験', 'M&Aテレアポの外注経験はあるか')
WHERE id IN (
  '9285ff21-015e-4885-8914-2d8c5d29068e', -- M&A
  '0f6f437e-4c96-4fc5-a7ff-fe4ba57b42f3', -- SaaS
  'fb3aeb82-6826-47d7-8ab4-9f7874e5c4dc', -- IFA
  'cbda458a-d7f7-4ca7-baf5-30fdedcc7679'  -- 人材
);

COMMIT;

-- 検証クエリ:
-- SELECT name, slug FROM business_categories WHERE product_id IN (SELECT id FROM products WHERE slug='sales_agency');
--   → M&A / SaaS / IFA の3件のみ
-- SELECT industry FROM clients WHERE id='69fd6233-1643-45dd-bec5-e3803f68fe76';
--   → '' (空文字)
