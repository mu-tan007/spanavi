-- Phase 3A: Teams & Spartia Career Deals foundation
-- 既存 teams/team_members テーブル (legacy) を拡張/再作成する。
--
-- Notes:
--   * 川又友翔 / 小口恵太郎 は members 未登録のため SKIP。
--   * 仕様の「長吉隆太郎」は DB 実在の「長吉陸太郎」を使用。
--   * 既存 teams には 2 行 (成尾/高橋) が入っているので ALTER で拡張。
--     teams.leader_id (auth.users FK) は legacy として残置、新機能は leader_member_id を使う。
--   * team_members は空だったので Drop & Recreate (user_id → member_id へ刷新)。

BEGIN;

-- 1. teams 拡張
ALTER TABLE teams ADD COLUMN IF NOT EXISTS engagement_id uuid REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS leader_member_id uuid REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_status_check;
ALTER TABLE teams ADD CONSTRAINT teams_status_check CHECK (status IN ('active','archived'));
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_engagement_id_name_key;
ALTER TABLE teams ADD CONSTRAINT teams_engagement_id_name_key UNIQUE (engagement_id, name);
CREATE INDEX IF NOT EXISTS idx_teams_org_id ON teams(org_id);
CREATE INDEX IF NOT EXISTS idx_teams_engagement_id ON teams(engagement_id);
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teams_tenant_isolation ON teams;
CREATE POLICY teams_tenant_isolation ON teams USING (org_id = public.get_user_org_id());
DROP TRIGGER IF EXISTS set_updated_at_teams ON teams;
CREATE TRIGGER set_updated_at_teams BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. team_members drop & recreate
DROP TABLE IF EXISTS team_members CASCADE;
CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','closer','sourcer','trainer','member')),
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  left_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_id)
);
CREATE INDEX idx_team_members_org_id ON team_members(org_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_member_id ON team_members(member_id);
CREATE INDEX idx_team_members_active ON team_members(team_id, member_id) WHERE left_at IS NULL;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_members_tenant_isolation ON team_members USING (org_id = public.get_user_org_id());
CREATE TRIGGER set_updated_at_team_members BEFORE UPDATE ON team_members FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. deals 追加カラム
ALTER TABLE deals ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_team_id ON deals(team_id);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS prospect_age int;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS prospect_line_id text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS current_annual_income numeric;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS target_annual_income numeric;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS crowdworks_profile_url text;

-- 4. 初期データ: 浅井チーム / 瀬尾チーム
INSERT INTO teams (org_id, engagement_id, name, display_order, status)
SELECT 'a0000000-0000-0000-0000-000000000001', e.id, '浅井チーム', 1, 'active'
FROM engagements e
WHERE e.org_id = 'a0000000-0000-0000-0000-000000000001' AND e.slug = 'spartia_career'
ON CONFLICT (engagement_id, name) DO NOTHING;

INSERT INTO teams (org_id, engagement_id, name, display_order, status)
SELECT 'a0000000-0000-0000-0000-000000000001', e.id, '瀬尾チーム', 2, 'active'
FROM engagements e
WHERE e.org_id = 'a0000000-0000-0000-0000-000000000001' AND e.slug = 'spartia_career'
ON CONFLICT (engagement_id, name) DO NOTHING;

-- 5. 浅井チームメンバー
INSERT INTO team_members (org_id, team_id, member_id, role)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  (SELECT t.id FROM teams t JOIN engagements e ON e.id = t.engagement_id
   WHERE t.name = '浅井チーム' AND e.slug = 'spartia_career'
     AND t.org_id = 'a0000000-0000-0000-0000-000000000001' LIMIT 1),
  m.id,
  CASE WHEN REPLACE(REPLACE(m.name,' ',''),'　','') = '浅井佑' THEN 'leader' ELSE 'sourcer' END
FROM members m
WHERE m.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND REPLACE(REPLACE(m.name,' ',''),'　','') IN (
    '浅井佑','成尾拓輝','横田星八','吉川諒馬','小中谷樹斗','長吉陸太郎','小川達也'
  )
ON CONFLICT (team_id, member_id) DO NOTHING;

UPDATE teams t
SET leader_member_id = (
  SELECT m.id FROM members m
  WHERE m.org_id = t.org_id
    AND REPLACE(REPLACE(m.name,' ',''),'　','') = '浅井佑' LIMIT 1
)
WHERE t.name = '浅井チーム'
  AND t.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND t.engagement_id IN (
    SELECT id FROM engagements WHERE slug = 'spartia_career'
      AND org_id = 'a0000000-0000-0000-0000-000000000001'
  );

-- 6. 瀬尾チームメンバー
INSERT INTO team_members (org_id, team_id, member_id, role)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  (SELECT t.id FROM teams t JOIN engagements e ON e.id = t.engagement_id
   WHERE t.name = '瀬尾チーム' AND e.slug = 'spartia_career'
     AND t.org_id = 'a0000000-0000-0000-0000-000000000001' LIMIT 1),
  m.id,
  CASE WHEN REPLACE(REPLACE(m.name,' ',''),'　','') = '瀬尾貫太' THEN 'leader' ELSE 'sourcer' END
FROM members m
WHERE m.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND REPLACE(REPLACE(m.name,' ',''),'　','') IN (
    '瀬尾貫太','植木帆希','石井佑弥','篠原大吾朗','鍛冶雅也','高橋航世'
  )
ON CONFLICT (team_id, member_id) DO NOTHING;

UPDATE teams t
SET leader_member_id = (
  SELECT m.id FROM members m
  WHERE m.org_id = t.org_id
    AND REPLACE(REPLACE(m.name,' ',''),'　','') = '瀬尾貫太' LIMIT 1
)
WHERE t.name = '瀬尾チーム'
  AND t.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND t.engagement_id IN (
    SELECT id FROM engagements WHERE slug = 'spartia_career'
      AND org_id = 'a0000000-0000-0000-0000-000000000001'
  );

COMMIT;
