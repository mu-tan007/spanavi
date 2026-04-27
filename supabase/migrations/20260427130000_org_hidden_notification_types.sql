-- システム seed の通知種類を org ごとに非表示にできるテーブル
-- 物理削除はせず、各テナントが「使わない」と判断したものを隠す
CREATE TABLE IF NOT EXISTS public.org_hidden_notification_types (
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  hidden_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, notification_type)
);

ALTER TABLE public.org_hidden_notification_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hidden_notif_select ON public.org_hidden_notification_types;
CREATE POLICY hidden_notif_select
  ON public.org_hidden_notification_types
  FOR SELECT
  USING (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS hidden_notif_modify ON public.org_hidden_notification_types;
CREATE POLICY hidden_notif_modify
  ON public.org_hidden_notification_types
  FOR ALL
  USING (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.org_id = public.get_user_org_id()
    )
  )
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.org_id = public.get_user_org_id()
    )
  );
