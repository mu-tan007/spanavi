-- 1. Sourcing の teams (成尾 / 高橋) に engagement_id を設定
UPDATE teams
SET engagement_id = (
  SELECT id FROM engagements WHERE slug = 'seller_sourcing'
    AND org_id = 'a0000000-0000-0000-0000-000000000001' LIMIT 1
),
display_order = CASE name WHEN '成尾' THEN 1 WHEN '高橋' THEN 2 ELSE display_order END
WHERE org_id = 'a0000000-0000-0000-0000-000000000001'
  AND engagement_id IS NULL
  AND name IN ('成尾', '高橋');

-- 2. members.team 文字列から team_members に backfill
INSERT INTO team_members (org_id, team_id, member_id, role)
SELECT
  m.org_id, t.id, m.id,
  CASE WHEN m.position LIKE '%リーダー%' THEN 'leader' ELSE 'sourcer' END
FROM members m
JOIN teams t ON t.name = m.team
  AND t.engagement_id = (SELECT id FROM engagements WHERE slug = 'seller_sourcing' AND org_id = m.org_id LIMIT 1)
WHERE m.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND m.is_active = true
  AND m.team IS NOT NULL
  AND m.team <> ''
ON CONFLICT (team_id, member_id) DO NOTHING;

-- 3. kpi_goals テーブル (事業横断: Sourcing / Career / Capital すべてで使い回し)
CREATE TABLE IF NOT EXISTS kpi_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('org','team','member')),
  scope_id uuid,
  kpi_type text NOT NULL CHECK (kpi_type IN ('calls','connections','appointments','connection_rate','appointment_rate')),
  period_type text NOT NULL CHECK (period_type IN ('daily','weekly','monthly')),
  target_value numeric(10,2) NOT NULL,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, scope_type, scope_id, kpi_type, period_type, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_kpi_goals_engagement ON kpi_goals(engagement_id);
CREATE INDEX IF NOT EXISTS idx_kpi_goals_scope ON kpi_goals(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_kpi_goals_effective ON kpi_goals(effective_from);

ALTER TABLE kpi_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_goals_read ON kpi_goals;
CREATE POLICY kpi_goals_read ON kpi_goals
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS kpi_goals_write ON kpi_goals;
CREATE POLICY kpi_goals_write ON kpi_goals
  FOR ALL TO authenticated
  USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.org_id = public.get_user_org_id()
        AND m.rank = 'admin'
    )
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.org_id = public.get_user_org_id()
        AND m.rank = 'admin'
    )
  );

DROP TRIGGER IF EXISTS set_updated_at_kpi_goals ON kpi_goals;
CREATE TRIGGER set_updated_at_kpi_goals BEFORE UPDATE ON kpi_goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
