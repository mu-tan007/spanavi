-- クライアント担当者テーブル
CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_contacts_select" ON client_contacts
  FOR SELECT USING (org_id = public.get_user_org_id());
CREATE POLICY "client_contacts_insert" ON client_contacts
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
CREATE POLICY "client_contacts_update" ON client_contacts
  FOR UPDATE USING (org_id = public.get_user_org_id());
CREATE POLICY "client_contacts_delete" ON client_contacts
  FOR DELETE USING (org_id = public.get_user_org_id());
