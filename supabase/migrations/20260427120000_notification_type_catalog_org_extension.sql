-- カスタム通知種類対応のための拡張
-- ・notification_type_catalog にカスタム行 (org_id 紐付き) を追加できるようにする
-- ・system seed (4 種) は is_system=true / org_id=NULL のまま全テナント共通
-- ・admin のみ自 org のカスタム種類を CRUD 可能

ALTER TABLE public.notification_type_catalog
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

UPDATE public.notification_type_catalog
   SET is_system = true
 WHERE org_id IS NULL AND is_system = false;

DROP POLICY IF EXISTS notif_catalog_select ON public.notification_type_catalog;
CREATE POLICY notif_catalog_select
  ON public.notification_type_catalog
  FOR SELECT
  USING (
    is_system = true
    OR org_id = public.get_user_org_id()
  );

DROP POLICY IF EXISTS notif_catalog_modify ON public.notification_type_catalog;
CREATE POLICY notif_catalog_modify
  ON public.notification_type_catalog
  FOR ALL
  USING (
    is_system = false
    AND org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.org_id = public.get_user_org_id()
    )
  )
  WITH CHECK (
    is_system = false
    AND org_id = public.get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.org_id = public.get_user_org_id()
    )
  );

-- engagement_notification_settings.notification_type FK は外す
-- （カスタム id は org スコープで衝突しない UUID を割り当てるため、参照整合性は app 側で担保）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engagement_notification_settings_notification_type_fkey'
  ) THEN
    ALTER TABLE public.engagement_notification_settings
      DROP CONSTRAINT engagement_notification_settings_notification_type_fkey;
  END IF;
END $$;
