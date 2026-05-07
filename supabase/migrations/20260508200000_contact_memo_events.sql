-- =====================================================================
-- contact_memo_events テーブル新設（既存コードが参照しているが本番DBに不在だった）
--   ContactDrawer のメモ録音保存先
--   ActivityTimeline で表示
--   CRMView の最終接点計算で使用
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.contact_memo_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  contact_id      uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  body_md         text,
  raw_transcript  text,
  voice_input_id  text,
  source          text NOT NULL DEFAULT 'manual',  -- 'manual' | 'voice_raw' | 'voice_ai' | 'schedule'
  extracted       jsonb DEFAULT '{}'::jsonb,
  author_user_id  uuid,
  author_name     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cme_org_created
  ON public.contact_memo_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cme_contact
  ON public.contact_memo_events(contact_id, created_at DESC);

-- RLS
ALTER TABLE public.contact_memo_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cme_select_own_org ON public.contact_memo_events;
CREATE POLICY cme_select_own_org
  ON public.contact_memo_events FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS cme_insert_own_org ON public.contact_memo_events;
CREATE POLICY cme_insert_own_org
  ON public.contact_memo_events FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id());

DROP POLICY IF EXISTS cme_update_own_org ON public.contact_memo_events;
CREATE POLICY cme_update_own_org
  ON public.contact_memo_events FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS cme_delete_own_org ON public.contact_memo_events;
CREATE POLICY cme_delete_own_org
  ON public.contact_memo_events FOR DELETE TO authenticated
  USING (org_id = get_user_org_id());
