-- Phase A: Caesar → Spanavi フル統合 (cap_* prefix 方式)
-- ---------------------------------------------------------
-- 34テーブル作成。tenant_id 列 / users FK / tenant-based RLS は廃止し、
-- Spanavi の認証 (auth.uid()) による authenticated-only に置き換え。
-- MaNews / Settings / Company / Reports / tenants / users / company_master 関連は除外。

BEGIN;

-- ============================================================
-- 1. cap_intermediaries / cap_contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS cap_intermediaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'intermediary',
  website text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cap_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intermediary_id uuid REFERENCES cap_intermediaries(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  title text,
  signature_raw text,
  business_card_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_contacts_interm ON cap_contacts(intermediary_id);

-- ============================================================
-- 2. cap_acquisition_needs / cap_need_broadcasts
-- ============================================================
CREATE TABLE IF NOT EXISTS cap_acquisition_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_code text,
  industry_label text,
  ev_min bigint,
  ev_max bigint,
  ebitda_multiple_max numeric(5,2),
  region text,
  priority smallint NOT NULL DEFAULT 2,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cap_need_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id uuid REFERENCES cap_acquisition_needs(id) ON DELETE SET NULL,
  subject text,
  body text,
  sent_to jsonb DEFAULT '[]'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. cap_deals + 全 deal_* サブテーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS cap_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intermediary_id uuid REFERENCES cap_intermediaries(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES cap_contacts(id) ON DELETE SET NULL,
  assigned_user_id uuid,
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'intermediary',
  platform_source text,
  status text NOT NULL DEFAULT 'nn_review',
  priority smallint NOT NULL DEFAULT 2,
  industry_code text,
  industry_label text,
  ev_estimate bigint,
  fee_estimate bigint,
  score jsonb DEFAULT '{}'::jsonb,
  stop_reason text,
  break_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deals_status ON cap_deals(status);

CREATE TABLE IF NOT EXISTS cap_deal_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  note text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_status_logs_deal ON cap_deal_status_logs(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  seller_name text,
  founded_year integer,
  employees integer,
  hq_address text,
  business_summary text,
  swot jsonb DEFAULT '{}'::jsonb,
  synergy jsonb DEFAULT '{}'::jsonb,
  market_analysis jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cap_deal_companies_deal ON cap_deal_companies(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  revenue bigint,
  gross_profit bigint,
  operating_income bigint,
  ebitda bigint,
  net_income bigint,
  total_assets bigint,
  net_assets bigint,
  cash bigint,
  interest_bearing_debt bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cap_deal_financials_year ON cap_deal_financials(deal_id, fiscal_year);

CREATE TABLE IF NOT EXISTS cap_deal_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  uploaded_by uuid,
  uploaded_via text NOT NULL DEFAULT 'internal',
  file_name text NOT NULL,
  file_type text,
  storage_path text NOT NULL,
  parsed_data jsonb DEFAULT '{}'::jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_files_deal ON cap_deal_files(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES cap_contacts(id) ON DELETE SET NULL,
  meeting_type text NOT NULL DEFAULT 'regular',
  held_at timestamptz,
  summary text,
  next_actions jsonb DEFAULT '[]'::jsonb,
  cal_event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_meetings_deal ON cap_deal_meetings(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text,
  status text NOT NULL DEFAULT 'pending',
  generated_email text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_qa_deal ON cap_deal_qa(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  contract_type text NOT NULL,
  storage_path text,
  signed_at timestamptz,
  esign_provider text,
  esign_envelope_id text,
  caution_points jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_contracts_deal ON cap_deal_contracts(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES cap_deals(id) ON DELETE CASCADE,
  assigned_to uuid,
  title text NOT NULL,
  due_date date,
  is_done boolean NOT NULL DEFAULT false,
  priority smallint NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_todos_deal ON cap_deal_todos(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  milestone text NOT NULL,
  scheduled_date date,
  completed_at timestamptz,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_schedules_deal ON cap_deal_schedules(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  nen_kai_net_assets bigint,
  nen_kai_years smallint,
  nen_kai_annual_profit bigint,
  nen_kai_result bigint,
  ev_ebitda_multiple numeric(5,2),
  ev_ebitda_result bigint,
  comp_transaction_multiple numeric(5,2),
  comp_transaction_basis text,
  comp_transaction_result bigint,
  dcf_wacc numeric(5,4),
  dcf_terminal_growth numeric(5,4),
  dcf_projections jsonb DEFAULT '[]'::jsonb,
  dcf_result bigint,
  valuation_low bigint,
  valuation_mid bigint,
  valuation_high bigint,
  analyst_comment text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cap_deal_valuations_deal ON cap_deal_valuations(deal_id);

CREATE TABLE IF NOT EXISTS cap_lbo_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  acquisition_price bigint,
  equity_ratio numeric(5,4),
  debt_ratio numeric(5,4),
  interest_rate numeric(5,4),
  repayment_years smallint,
  exit_multiple numeric(5,2),
  exit_year smallint,
  irr numeric(6,4),
  moic numeric(6,3),
  scenarios jsonb DEFAULT '[]'::jsonb,
  bank_memo text,
  assumptions jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cap_lbo_models_deal ON cap_lbo_models(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_bank_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  status text NOT NULL DEFAULT 'approached',
  loan_amount bigint,
  interest_rate numeric(5,4),
  repayment_years smallint,
  covenants jsonb DEFAULT '[]'::jsonb,
  term_sheet_path text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_bank_terms_deal ON cap_deal_bank_terms(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_dd_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  category text NOT NULL,
  item text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assignee_id uuid,
  due_date date,
  file_path text,
  risk_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_dd_checklists_deal ON cap_deal_dd_checklists(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_negotiation_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  category text NOT NULL,
  item text NOT NULL,
  our_position text,
  their_position text,
  current_status text,
  priority smallint NOT NULL DEFAULT 2,
  resolved boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_negotiation_terms_deal ON cap_deal_negotiation_terms(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_closing_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  category text NOT NULL,
  item text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assignee_id uuid,
  due_date date,
  completed_at timestamptz,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_closing_checklists_deal ON cap_deal_closing_checklists(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_pmi_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'day100',
  category text NOT NULL,
  title text NOT NULL,
  owner text,
  due_date date,
  status text NOT NULL DEFAULT 'not_started',
  synergy_type text,
  synergy_amount bigint,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_pmi_tasks_deal ON cap_deal_pmi_tasks(deal_id);

CREATE TABLE IF NOT EXISTS cap_deal_investment_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  actual_revenue bigint,
  actual_ebitda bigint,
  actual_net_income bigint,
  planned_ebitda bigint,
  synergy_realized bigint,
  irr_actual numeric(6,4),
  moic_actual numeric(6,3),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cap_deal_investment_tracking_year ON cap_deal_investment_tracking(deal_id, fiscal_year);

CREATE TABLE IF NOT EXISTS cap_deal_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  model text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_deal_chat_messages_deal ON cap_deal_chat_messages(deal_id);

-- ============================================================
-- 4. cap_comparable_transactions / cap_emails / etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS cap_comparable_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_code text,
  industry_label text,
  deal_year integer,
  revenue bigint,
  ebitda bigint,
  ev bigint,
  ev_ebitda_multiple numeric(5,2),
  net_assets bigint,
  annual_profit bigint,
  nen_kai_multiple numeric(5,2),
  source text,
  notes text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_comp_transactions_industry ON cap_comparable_transactions(industry_code);

CREATE TABLE IF NOT EXISTS cap_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES cap_deals(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES cap_contacts(id) ON DELETE SET NULL,
  direction text NOT NULL,
  subject text,
  body text,
  ai_draft text,
  sent_at timestamptz,
  gmail_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  gmail_thread_id text,
  from_email text,
  from_name text,
  to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  snippet text,
  received_at timestamptz,
  raw_headers jsonb,
  has_attachments boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_status text NOT NULL DEFAULT 'pending',
  ai_classification jsonb,
  ai_extracted jsonb,
  ai_proposals jsonb NOT NULL DEFAULT '[]'::jsonb,
  classified_at timestamptz,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cap_emails_deal ON cap_emails(deal_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cap_emails_user_gmail_message
  ON cap_emails(user_id, gmail_message_id) WHERE gmail_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cap_emails_ai_pending ON cap_emails(ai_status) WHERE ai_status IN ('pending','classified');
CREATE INDEX IF NOT EXISTS idx_cap_emails_user_received ON cap_emails(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_cap_emails_thread ON cap_emails(gmail_thread_id);

CREATE TABLE IF NOT EXISTS cap_advisor_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES cap_deals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES cap_contacts(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '{"upload":true,"input_qa":true,"view_files":true}'::jsonb,
  expires_at timestamptz NOT NULL,
  last_accessed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_advisor_invitations_deal ON cap_advisor_invitations(deal_id);
CREATE INDEX IF NOT EXISTS idx_cap_advisor_invitations_token ON cap_advisor_invitations(token_hash);

CREATE TABLE IF NOT EXISTS cap_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES cap_deals(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  requested_by uuid,
  approver_id uuid,
  status text NOT NULL DEFAULT 'pending',
  request_note text,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_approval_requests_deal ON cap_approval_requests(deal_id);

CREATE TABLE IF NOT EXISTS cap_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  deal_id uuid REFERENCES cap_deals(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  summary text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_notifications_user ON cap_notifications(user_id);

-- ============================================================
-- 5. cap_ma_agencies / cap_templates / cap_template_outputs
-- ============================================================
CREATE TABLE IF NOT EXISTS cap_ma_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id integer,
  name text NOT NULL,
  prefecture text,
  staff_count integer,
  info_sharing boolean DEFAULT false,
  deal_count_2024 integer,
  fee_type text,
  min_fee text,
  status text NOT NULL DEFAULT 'not_contacted',
  notes text,
  linked_intermediary_id uuid REFERENCES cap_intermediaries(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  fa_seller_success_fee text,
  fa_seller_calc_method text,
  fa_seller_min_fee text,
  fa_seller_other_fee text,
  fa_buyer_success_fee text,
  fa_buyer_calc_method text,
  broker_seller_success_fee text,
  broker_seller_calc_method text,
  broker_seller_min_fee text,
  broker_seller_other_fee text,
  broker_buyer_success_fee text,
  broker_buyer_calc_method text,
  website text,
  contact_form_url text,
  contact_email text,
  contact_name text,
  contact_phone text
);

CREATE TABLE IF NOT EXISTS cap_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  description text,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint,
  variables jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cap_template_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES cap_templates(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES cap_deals(id) ON DELETE SET NULL,
  output_path text,
  variables_used jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. cap_firm_contracts / cap_gcal_tokens / cap_gmail_sync_state
-- ============================================================
CREATE TABLE IF NOT EXISTS cap_firm_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intermediary_id uuid NOT NULL REFERENCES cap_intermediaries(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES cap_contacts(id) ON DELETE SET NULL,
  contract_type text NOT NULL,
  storage_path text,
  file_name text,
  signed_at date,
  expires_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cap_gcal_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  scope text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cap_gmail_sync_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  history_id text,
  last_full_sync_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. RLS (authenticated-only) + updated_at trigger
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cap_intermediaries','cap_contacts',
    'cap_acquisition_needs','cap_need_broadcasts',
    'cap_deals','cap_deal_status_logs','cap_deal_companies','cap_deal_financials',
    'cap_deal_files','cap_deal_meetings','cap_deal_qa','cap_deal_contracts',
    'cap_deal_todos','cap_deal_schedules','cap_deal_valuations','cap_lbo_models',
    'cap_deal_bank_terms','cap_deal_dd_checklists','cap_deal_negotiation_terms',
    'cap_deal_closing_checklists','cap_deal_pmi_tasks','cap_deal_investment_tracking',
    'cap_deal_chat_messages','cap_comparable_transactions','cap_emails',
    'cap_advisor_invitations','cap_approval_requests','cap_notifications',
    'cap_ma_agencies','cap_templates','cap_template_outputs',
    'cap_firm_contracts'
    -- gcal_tokens / gmail_sync_state は意図的にRLS policyを作らない (service_role経由のみ)
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS cap_authenticated_all ON %I', t);
    EXECUTE format('CREATE POLICY cap_authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

ALTER TABLE cap_gcal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE cap_gmail_sync_state ENABLE ROW LEVEL SECURITY;

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cap_intermediaries','cap_contacts','cap_acquisition_needs','cap_deals',
    'cap_deal_companies','cap_deal_valuations','cap_lbo_models','cap_deal_bank_terms',
    'cap_deal_dd_checklists','cap_deal_negotiation_terms','cap_deal_pmi_tasks',
    'cap_firm_contracts','cap_gcal_tokens','cap_gmail_sync_state','cap_templates'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
