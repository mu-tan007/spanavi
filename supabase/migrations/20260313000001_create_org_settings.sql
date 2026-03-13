-- ============================================================
-- org_settings テーブル作成
-- ============================================================
CREATE TABLE IF NOT EXISTS org_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  setting_key text NOT NULL,
  setting_value text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, setting_key)
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_settings_select" ON org_settings
  FOR SELECT USING (org_id = 'a0000000-0000-0000-0000-000000000001');

CREATE POLICY "org_settings_all" ON org_settings
  FOR ALL USING (org_id = 'a0000000-0000-0000-0000-000000000001');

-- 初期データ
INSERT INTO org_settings (org_id, setting_key, setting_value) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'reward_rate_trainee',        '22'),
  ('a0000000-0000-0000-0000-000000000001', 'reward_rate_player',         '25'),
  ('a0000000-0000-0000-0000-000000000001', 'reward_rate_spartan',        '27'),
  ('a0000000-0000-0000-0000-000000000001', 'reward_rate_super_spartan',  '28'),
  ('a0000000-0000-0000-0000-000000000001', 'team_bonus_rate',            '3'),
  ('a0000000-0000-0000-0000-000000000001', 'team_bonus_leader_ratio',    '60'),
  ('a0000000-0000-0000-0000-000000000001', 'team_bonus_subleader_ratio', '40'),
  ('a0000000-0000-0000-0000-000000000001', 'appo_fee_under_500m',        '100000'),
  ('a0000000-0000-0000-0000-000000000001', 'appo_fee_500m_to_1b',        '150000'),
  ('a0000000-0000-0000-0000-000000000001', 'slack_webhook_ranking',      ''),
  ('a0000000-0000-0000-0000-000000000001', 'slack_webhook_precheck',     ''),
  ('a0000000-0000-0000-0000-000000000001', 'slack_webhook_keiden',       ''),
  ('a0000000-0000-0000-0000-000000000001', 'zoom_account_id',            ''),
  ('a0000000-0000-0000-0000-000000000001', 'zoom_client_id',             ''),
  ('a0000000-0000-0000-0000-000000000001', 'zoom_client_secret',         '')
ON CONFLICT (org_id, setting_key) DO NOTHING;

-- members テーブルに is_active カラムを追加（ステータス管理用）
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
