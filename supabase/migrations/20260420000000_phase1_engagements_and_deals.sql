-- Phase 1: engagements / deals / customers foundation
-- See PHASE1_IMPLEMENTATION.md for design rationale.
-- Adjusted for current schema:
--   * appointments.item_id (not call_list_item_id)
--   * call_list_items.representative (not contact_name)

BEGIN;

-- 1. engagements
CREATE TABLE IF NOT EXISTS engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'seller_sourcing','matching','spartia_career','spartia_recruitment','spanavi','spartia_capital'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  product_category text,
  display_order int DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_engagements_org_id ON engagements(org_id);
CREATE INDEX IF NOT EXISTS idx_engagements_type ON engagements(type);
CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status);
ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagements_tenant_isolation ON engagements;
CREATE POLICY engagements_tenant_isolation ON engagements
  USING (org_id = public.get_user_org_id());
COMMENT ON TABLE engagements IS 'MASP配下の事業単位';

-- 2. product_plans
CREATE TABLE IF NOT EXISTS product_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_total numeric NOT NULL,
  price_tax_excluded numeric,
  duration_days int,
  session_count int,
  vup_included boolean DEFAULT false,
  payment_type text,
  default_installment_count int,
  description text,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_plans_engagement_id ON product_plans(engagement_id);
CREATE INDEX IF NOT EXISTS idx_product_plans_org_id ON product_plans(org_id);
ALTER TABLE product_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_plans_tenant_isolation ON product_plans;
CREATE POLICY product_plans_tenant_isolation ON product_plans
  USING (org_id = public.get_user_org_id());

-- 3. session_templates
CREATE TABLE IF NOT EXISTS session_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  session_code text NOT NULL,
  phase text,
  title text NOT NULL,
  description text,
  session_order int NOT NULL,
  min_plan_tier int DEFAULT 1,
  default_homework text,
  coach_checklist_template jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, session_code)
);
CREATE INDEX IF NOT EXISTS idx_session_templates_engagement_id ON session_templates(engagement_id);
CREATE INDEX IF NOT EXISTS idx_session_templates_org_id ON session_templates(org_id);
ALTER TABLE session_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_templates_tenant_isolation ON session_templates;
CREATE POLICY session_templates_tenant_isolation ON session_templates
  USING (org_id = public.get_user_org_id());

-- 4. deals
CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  call_list_item_id uuid REFERENCES call_list_items(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  prospect_name text,
  prospect_company text,
  prospect_phone text,
  prospect_email text,
  source_channel text,
  source_detail text,
  is_qualified boolean,
  qualification_reason text,
  stage text NOT NULL,
  stage_changed_at timestamptz DEFAULT now(),
  sourcer_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  closer_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  trainer_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  selected_plan_id uuid REFERENCES product_plans(id) ON DELETE SET NULL,
  deal_value numeric,
  probability int CHECK (probability >= 0 AND probability <= 100),
  expected_close_date date,
  closed_status text CHECK (closed_status IN ('open','won','lost')) DEFAULT 'open',
  closed_at timestamptz,
  lost_reason text,
  notes text,
  custom_fields jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deals_org_id ON deals(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_engagement_id ON deals(engagement_id);
CREATE INDEX IF NOT EXISTS idx_deals_client_id ON deals(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_appointment_id ON deals(appointment_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_closed_status ON deals(closed_status);
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deals_tenant_isolation ON deals;
CREATE POLICY deals_tenant_isolation ON deals
  USING (org_id = public.get_user_org_id());
COMMENT ON TABLE deals IS '商談パイプライン。1 Deal : 1 Appointment';

-- 5. customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  source_deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  line_id text,
  current_annual_income numeric,
  target_annual_income numeric,
  social_style text,
  social_style_detail jsonb,
  clifton_top5 text[],
  plan_id uuid REFERENCES product_plans(id) ON DELETE SET NULL,
  contract_date date,
  contract_start_date date,
  contract_end_date date,
  contract_status text DEFAULT 'active' CHECK (contract_status IN ('active','completed','churned','paused','locked')),
  assigned_coach_id uuid REFERENCES members(id) ON DELETE SET NULL,
  assigned_sales_id uuid REFERENCES members(id) ON DELETE SET NULL,
  sessions_completed int DEFAULT 0,
  sessions_total int,
  homework_completion_rate numeric,
  avg_satisfaction numeric,
  churn_risk text,
  heat_level text,
  total_amount numeric,
  deposit_amount numeric,
  deposit_paid boolean DEFAULT false,
  payment_method text,
  shinpan_company text,
  result_company text,
  result_annual_income numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON customers(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_engagement_id ON customers(engagement_id);
CREATE INDEX IF NOT EXISTS idx_customers_source_deal_id ON customers(source_deal_id);
CREATE INDEX IF NOT EXISTS idx_customers_contract_status ON customers(contract_status);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_tenant_isolation ON customers;
CREATE POLICY customers_tenant_isolation ON customers
  USING (org_id = public.get_user_org_id());

-- 6. customer_sessions
CREATE TABLE IF NOT EXISTS customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  session_code text NOT NULL,
  phase text,
  title text,
  description text,
  session_order int,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','scheduled','completed','skipped')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  duration_minutes int,
  coach_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  coach_notes text,
  coach_checklist jsonb,
  self_evaluation_score int CHECK (self_evaluation_score >= 1 AND self_evaluation_score <= 5),
  self_evaluation_notes text,
  homework_description text,
  homework_status text DEFAULT 'assigned' CHECK (homework_status IN ('assigned','submitted','reviewed','skipped')),
  homework_submitted_at timestamptz,
  heat_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, session_code)
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_id ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_org_id ON customer_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_status ON customer_sessions(status);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_scheduled_at ON customer_sessions(scheduled_at);
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_sessions_tenant_isolation ON customer_sessions;
CREATE POLICY customer_sessions_tenant_isolation ON customer_sessions
  USING (org_id = public.get_user_org_id());

-- 7. payment_schedules
CREATE TABLE IF NOT EXISTS payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  payment_type text NOT NULL CHECK (payment_type IN ('deposit','installment','lump_sum')),
  installment_number int,
  installment_total int,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  cooling_off_date date,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','paid','overdue','failed','locked')),
  paid_at timestamptz,
  paid_amount numeric,
  payment_method text,
  transaction_ref text,
  overdue_since date,
  escalation_status text,
  escalation_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_customer_id ON payment_schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_org_id ON payment_schedules(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_status ON payment_schedules(status);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_due_date ON payment_schedules(due_date);
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_schedules_tenant_isolation ON payment_schedules;
CREATE POLICY payment_schedules_tenant_isolation ON payment_schedules
  USING (org_id = public.get_user_org_id());

-- 8. 既存テーブルへの engagement_id 追加
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS engagement_id uuid REFERENCES engagements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_call_lists_engagement_id ON call_lists(engagement_id);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS engagement_id uuid REFERENCES engagements(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES deals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_engagement_id ON appointments(engagement_id);
CREATE INDEX IF NOT EXISTS idx_appointments_deal_id ON appointments(deal_id);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS engagement_id uuid REFERENCES engagements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_engagement_id ON clients(engagement_id);

-- 9. updated_at auto trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_engagements ON engagements;
CREATE TRIGGER set_updated_at_engagements BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_product_plans ON product_plans;
CREATE TRIGGER set_updated_at_product_plans BEFORE UPDATE ON product_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_session_templates ON session_templates;
CREATE TRIGGER set_updated_at_session_templates BEFORE UPDATE ON session_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_deals ON deals;
CREATE TRIGGER set_updated_at_deals BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_customers ON customers;
CREATE TRIGGER set_updated_at_customers BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_customer_sessions ON customer_sessions;
CREATE TRIGGER set_updated_at_customer_sessions BEFORE UPDATE ON customer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_payment_schedules ON payment_schedules;
CREATE TRIGGER set_updated_at_payment_schedules BEFORE UPDATE ON payment_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 10. deals.stage 変更時 stage_changed_at 自動更新
CREATE OR REPLACE FUNCTION public.tg_deals_stage_changed()
RETURNS trigger AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deals_stage_changed ON deals;
CREATE TRIGGER deals_stage_changed BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_deals_stage_changed();

-- 11. 初期データ: 6 engagements
INSERT INTO engagements (org_id, name, slug, type, status, display_order, description)
VALUES
  ('a0000000-0000-0000-0000-000000000001','Seller Sourcing','seller_sourcing','seller_sourcing','active',1,'M&A売り手ソーシング事業'),
  ('a0000000-0000-0000-0000-000000000001','Matching','matching','matching','active',2,'M&A買い手マッチング事業'),
  ('a0000000-0000-0000-0000-000000000001','Spartia Career','spartia_career','spartia_career','active',3,'キャリアコーチング事業（スパキャリ）'),
  ('a0000000-0000-0000-0000-000000000001','Spartia Recruitment','spartia_recruitment','spartia_recruitment','active',4,'人材紹介事業'),
  ('a0000000-0000-0000-0000-000000000001','Spanavi','spanavi','spanavi','active',5,'Spanavi SaaS事業'),
  ('a0000000-0000-0000-0000-000000000001','Spartia Capital','spartia_capital','spartia_capital','active',6,'自社買収ソーシング')
ON CONFLICT (org_id, slug) DO NOTHING;

-- 12. 初期データ: Spartia Career 3プラン
INSERT INTO product_plans (org_id, engagement_id, name, price_total, price_tax_excluded, duration_days, session_count, vup_included, payment_type, default_installment_count, display_order)
SELECT e.org_id, e.id, plan.name, plan.price_total, plan.price_tax_excluded, plan.duration_days, plan.session_count, plan.vup_included, plan.payment_type, plan.default_installment_count, plan.display_order
FROM engagements e
CROSS JOIN (VALUES
  ('スターターコース', 480000, 436363, 40, 5, false, 'flexible', 24, 1),
  ('スパルタンコース', 980000, 890909, 90, 15, false, 'deposit_plus_installment', 24, 2),
  ('スーパースパルタンコース', 1300000, 1181818, 180, 22, true, 'deposit_plus_installment', 24, 3)
) AS plan(name, price_total, price_tax_excluded, duration_days, session_count, vup_included, payment_type, default_installment_count, display_order)
WHERE e.slug = 'spartia_career' AND e.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM product_plans pp WHERE pp.engagement_id = e.id AND pp.name = plan.name
  );

-- 13. 初期データ: Spartia Career カリキュラム22回
INSERT INTO session_templates (org_id, engagement_id, session_code, phase, title, description, session_order, min_plan_tier)
SELECT e.org_id, e.id, s.session_code, s.phase, s.title, s.description, s.session_order, s.min_plan_tier
FROM engagements e
CROSS JOIN (VALUES
  ('S1','自己分析','原体験の採掘','モチベーショングラフ作成。幼少期〜現在の人生の転機・感情を可視化',1,1),
  ('S2','自己分析','資産の棚卸し','As is / To Be 分析。現在と理想の年収・仕事・ライフスタイルのギャップを特定',2,1),
  ('S3','自己分析','市場価値の再定義','クリフトンストレングス（上位5資質の深掘り）。強みを言語化',3,1),
  ('S4','自己分析','ライフキャリアプラン','5年刻みの将来設計を描く',4,1),
  ('S5','自己分析','自己分析総括','転職軸の確定とスケジュール策定',5,1),
  ('S6','業界・企業研究','業界選定','IT/メーカー/商社/金融等20以上の業界リストから適正業界を絞り込み',6,2),
  ('S7','業界・企業研究','企業研究・志望動機','10社を選定し、各社に対する志望動機を作成',7,2),
  ('S8','論理思考・書類','論理思考（基礎）','IGDS法・PREP法の実践',8,2),
  ('S9','論理思考・書類','履歴書・職務経歴書','職務経歴書の書き換え',9,2),
  ('S10','論理思考・書類','書類完成','完成版テンプレートで仕上げ',10,2),
  ('S11','面接対策','面接準備','面接の科学（SPIN話法）、5つのポイント',11,2),
  ('S12','面接対策','ストーリーテリング','面接頻出質問への回答準備、ストーリー構築',12,2),
  ('S13','面接対策','模擬面接','個社対策、評価項目別フィードバック',13,2),
  ('S14','戦略・交渉','論理思考（応用）','マンダラート、緊急度×重要度マトリクス',14,2),
  ('S15','戦略・交渉','年収交渉・最終戦略','面接スケジュール管理、条件交渉',15,2),
  ('S16','総括','振り返り','全体の振り返りと今後のアクション',16,2),
  ('Vup1','転職後支援','ロールモデル設定','転職後のロールモデルを定める',17,3),
  ('Vup2','転職後支援','キャリアプラン再設計','入社後のキャリアプランを再構築',18,3),
  ('Vup3','転職後支援','ゴール設定','短期・中期・長期のゴール設定',19,3),
  ('Vup4','転職後支援','営業コミュニケーション','社内外での効果的なコミュニケーション',20,3),
  ('Vup5','転職後支援','ポジティブシンキング','メンタルマネジメント',21,3),
  ('Vup6','転職後支援','タスクマネジメント','効率的な業務遂行',22,3)
) AS s(session_code, phase, title, description, session_order, min_plan_tier)
WHERE e.slug = 'spartia_career' AND e.org_id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (engagement_id, session_code) DO NOTHING;

-- 14. org_settings: Deal Stages
INSERT INTO org_settings (org_id, setting_key, setting_value)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'deal_stages_seller_sourcing',
  '{"stages":[
    {"id":"first_meeting_done","label":"初回面談実施","order":1,"owner":"masp"},
    {"id":"additional_meetings","label":"複数回面談","order":2,"owner":"client"},
    {"id":"advisor_contract","label":"アドバイザー契約","order":3,"owner":"client"},
    {"id":"buyer_search","label":"買い手探索","order":4,"owner":"client"},
    {"id":"top_meeting","label":"トップ面談","order":5,"owner":"client"},
    {"id":"loi_basic_agreement","label":"意向表明・基本合意","order":6,"owner":"client"},
    {"id":"due_diligence","label":"DD","order":7,"owner":"client"},
    {"id":"spa_closing","label":"SPA・クロージング","order":8,"owner":"client"},
    {"id":"closed_won","label":"成約","order":9,"owner":"client","is_terminal":true},
    {"id":"closed_lost","label":"失注","order":99,"owner":"any","is_terminal":true}
  ]}'::jsonb
) ON CONFLICT (org_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

INSERT INTO org_settings (org_id, setting_key, setting_value)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'deal_stages_spartia_career',
  '{"stages":[
    {"id":"application_received","label":"応募獲得","order":1,"owner":"sourcer"},
    {"id":"service_request_pending","label":"申請中","order":2,"owner":"sourcer"},
    {"id":"scheduling","label":"日程調整中","order":3,"owner":"sourcer"},
    {"id":"meeting_confirmed","label":"面談予約確定","order":4,"owner":"sourcer"},
    {"id":"first_meeting_done","label":"初回面談完了","order":5,"owner":"closer"},
    {"id":"closing","label":"CL中","order":6,"owner":"closer"},
    {"id":"contract_process","label":"契約手続き中","order":7,"owner":"closer"},
    {"id":"cooling_off","label":"CO期間","order":8,"owner":"closer"},
    {"id":"preparation","label":"講義準備中","order":9,"owner":"trainer"},
    {"id":"closed_won","label":"契約成立","order":10,"owner":"trainer","is_terminal":true},
    {"id":"closed_lost","label":"失注","order":99,"owner":"any","is_terminal":true}
  ]}'::jsonb
) ON CONFLICT (org_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- 15. 既存データ backfill
UPDATE clients SET engagement_id = (
  SELECT id FROM engagements WHERE org_id = clients.org_id AND slug = 'seller_sourcing' LIMIT 1
) WHERE engagement_id IS NULL AND org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE call_lists SET engagement_id = (
  SELECT id FROM engagements WHERE org_id = call_lists.org_id AND slug = 'seller_sourcing' LIMIT 1
) WHERE engagement_id IS NULL AND org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE appointments SET engagement_id = (
  SELECT id FROM engagements WHERE org_id = appointments.org_id AND slug = 'seller_sourcing' LIMIT 1
) WHERE engagement_id IS NULL AND org_id = 'a0000000-0000-0000-0000-000000000001';

-- 16. 2026-04-01以降のアポを Deal 化（appointments.item_id/company_name/representative を使用）
INSERT INTO deals (
  org_id, engagement_id, client_id, call_list_item_id, appointment_id,
  prospect_name, prospect_company, prospect_phone,
  stage, stage_changed_at, created_at
)
SELECT
  a.org_id,
  a.engagement_id,
  a.client_id,
  a.item_id,
  a.id,
  COALESCE(a.representative, ''),
  COALESCE(a.company_name, ''),
  a.phone,
  'first_meeting_done',
  a.appointment_date::timestamptz,
  a.created_at
FROM appointments a
WHERE a.appointment_date >= '2026-04-01'
  AND a.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND a.engagement_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE appointment_id = a.id);

UPDATE appointments a
SET deal_id = d.id
FROM deals d
WHERE d.appointment_id = a.id AND a.deal_id IS NULL;

COMMIT;
