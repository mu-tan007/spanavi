CREATE TABLE incoming_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  caller_number text,
  caller_name text,
  item_id uuid REFERENCES call_list_items(id),
  company_name text,
  received_at timestamp with time zone DEFAULT now(),
  status text DEFAULT '未対応',
  memo text,
  handled_by text,
  handled_at timestamp with time zone
);

ALTER TABLE incoming_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_access" ON incoming_calls
  USING (org_id = 'a0000000-0000-0000-0000-000000000001');
