-- ============================================================
-- Push notification subscriptions テーブル
-- 日付: 2026-03-30
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Follow existing pattern with get_user_org_id()
CREATE POLICY "push_subscriptions_select"
  ON push_subscriptions FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "push_subscriptions_insert"
  ON push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "push_subscriptions_update"
  ON push_subscriptions FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "push_subscriptions_delete"
  ON push_subscriptions FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id());
