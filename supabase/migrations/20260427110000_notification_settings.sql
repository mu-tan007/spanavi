-- ============================================================
-- 通知設定 (事業ごと + 個人ごと)
-- ------------------------------------------------------------
-- 1) notification_type_catalog        : 通知種類のマスタ (system seed)
-- 2) engagement_notification_settings : 事業ごとのオーバーライド
-- 3) push_notification_preferences    : 個人 opt-out （既存テーブル拡張）
-- ============================================================

-- ------------------------------------------------------------
-- 1) 通知種類カタログ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_type_catalog (
  id                          text PRIMARY KEY,
  label_jp                    text NOT NULL,
  description_jp              text,
  default_recipients_scope    text NOT NULL,   -- 'all_engagement_members' | 'team_leaders_and_above' | 'getter_and_team_and_admin' | 'admin_only'
  has_threshold               boolean NOT NULL DEFAULT false,
  threshold_unit              text,            -- '円' / '件' など UI 用
  display_order               integer NOT NULL DEFAULT 0,
  is_active                   boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- 初期シード（4 種）
INSERT INTO public.notification_type_catalog
  (id, label_jp, description_jp, default_recipients_scope, has_threshold, threshold_unit, display_order)
VALUES
  ('appointment_created', 'アポ獲得通知', '誰かがアポを取った瞬間に通知', 'all_engagement_members',     false, NULL,  1),
  ('precheck_reminder',   '事前確認リマインダー', '面談日の1営業日前 10:00 JST に未確認のアポを通知', 'getter_and_team_and_admin', false, NULL, 2),
  ('large_deal',          '大型受注セレブレーション', '指定金額以上の受注が発生した時に通知', 'all_engagement_members', true, '円',  3),
  ('daily_report',        'リーダー日次レポート', '毎日 17:00 JST にチーム実績サマリを通知', 'team_leaders_and_above', false, NULL, 4)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2) 事業ごとの通知ルール（無い場合は catalog の default を使う）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.engagement_notification_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  engagement_id       uuid NOT NULL REFERENCES public.engagements(id)   ON DELETE CASCADE,
  notification_type   text NOT NULL REFERENCES public.notification_type_catalog(id),
  enabled             boolean NOT NULL DEFAULT true,
  recipients_scope    text NOT NULL,           -- catalog.default_recipients_scope の override
  threshold_value     bigint,                  -- has_threshold=true の通知でのみ使用
  display_order       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, notification_type)
);

CREATE INDEX IF NOT EXISTS engagement_notif_settings_org_idx        ON public.engagement_notification_settings(org_id);
CREATE INDEX IF NOT EXISTS engagement_notif_settings_engagement_idx ON public.engagement_notification_settings(engagement_id);

-- ------------------------------------------------------------
-- 3) push_notification_preferences に notification_type 列を追加
-- ------------------------------------------------------------
-- 既存 PK = (user_id, engagement_id) を 3 列に拡張する。
-- 既存行は notification_type='_all' で「事業マスター ON/OFF」として温存する。
ALTER TABLE public.push_notification_preferences
  ADD COLUMN IF NOT EXISTS notification_type text NOT NULL DEFAULT '_all';

DO $$
BEGIN
  -- PK を旧 (user_id, engagement_id) → (user_id, engagement_id, notification_type) に張り替え
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_notification_preferences_pkey'
  ) THEN
    ALTER TABLE public.push_notification_preferences
      DROP CONSTRAINT push_notification_preferences_pkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.push_notification_preferences'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.push_notification_preferences
      ADD CONSTRAINT push_notification_preferences_pkey
      PRIMARY KEY (user_id, engagement_id, notification_type);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------
ALTER TABLE public.notification_type_catalog          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_notification_settings   ENABLE ROW LEVEL SECURITY;

-- catalog は全ユーザーから SELECT 可（system data）
DROP POLICY IF EXISTS notif_catalog_select ON public.notification_type_catalog;
CREATE POLICY notif_catalog_select
  ON public.notification_type_catalog
  FOR SELECT
  USING (true);

-- engagement_notification_settings: 同 org のメンバーは SELECT、admin のみ INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS engagement_notif_select   ON public.engagement_notification_settings;
DROP POLICY IF EXISTS engagement_notif_modify   ON public.engagement_notification_settings;

CREATE POLICY engagement_notif_select
  ON public.engagement_notification_settings
  FOR SELECT
  USING (org_id = public.get_user_org_id());

CREATE POLICY engagement_notif_modify
  ON public.engagement_notification_settings
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

-- ------------------------------------------------------------
-- 5) updated_at 自動更新トリガー
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engagement_notif_settings_set_updated_at ON public.engagement_notification_settings;
CREATE TRIGGER engagement_notif_settings_set_updated_at
  BEFORE UPDATE ON public.engagement_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
