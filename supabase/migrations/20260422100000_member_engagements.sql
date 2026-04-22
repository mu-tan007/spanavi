-- MASP 全社の従業員が各事業へ所属している関係を保持する中間テーブル
-- MASP タブの Members ページでチェックボックス操作、各事業タブでフィルタ表示に使う
CREATE TABLE IF NOT EXISTS member_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, engagement_id)
);
CREATE INDEX IF NOT EXISTS idx_member_engagements_member ON member_engagements(member_id);
CREATE INDEX IF NOT EXISTS idx_member_engagements_engagement ON member_engagements(engagement_id);

ALTER TABLE member_engagements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_engagements_tenant_isolation ON member_engagements;
CREATE POLICY member_engagements_tenant_isolation ON member_engagements
  USING (org_id = public.get_user_org_id());

-- Backfill: 全 active members を Sourcing に自動所属
INSERT INTO member_engagements (org_id, member_id, engagement_id)
SELECT m.org_id, m.id, e.id
FROM members m
CROSS JOIN engagements e
WHERE m.is_active = true
  AND e.slug = 'seller_sourcing'
  AND m.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND e.org_id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (member_id, engagement_id) DO NOTHING;

-- Backfill: team_members (浅井 / 瀬尾 13名) を Career に自動所属
INSERT INTO member_engagements (org_id, member_id, engagement_id)
SELECT tm.org_id, tm.member_id, e.id
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
JOIN engagements e ON e.id = t.engagement_id AND e.slug = 'spartia_career'
WHERE tm.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND tm.left_at IS NULL
ON CONFLICT (member_id, engagement_id) DO NOTHING;
