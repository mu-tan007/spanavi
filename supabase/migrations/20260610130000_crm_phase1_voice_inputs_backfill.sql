set local search_path = public, extensions;

-- ============================================================
-- CRM Phase1 の未適用分を補完（2026-06-10 同期チェックで発覚）
-- ------------------------------------------------------------
-- 20260428000000_crm_personality_phase1.sql のうち、本番には
-- client_contacts.is_primary と contact_memo_events だけが
-- 別名migrationで適用されており、以下が欠けていた:
--   1) contact_voice_inputs テーブル（音声入力ログ）
--   2) contact_memo_events.voice_input_id の FK
--   3) Storage バケット contact-audio + ポリシー
-- ============================================================

-- 1) contact_voice_inputs — 音声入力ログ（原本永続保持）
CREATE TABLE IF NOT EXISTS contact_voice_inputs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  target_kind           TEXT NOT NULL,
                        -- 'contact_memo' | 'client_update' | 'client_create'
  contact_id            UUID REFERENCES client_contacts(id) ON DELETE SET NULL,
  client_id             UUID REFERENCES clients(id) ON DELETE SET NULL,

  audio_url             TEXT,
  duration_sec          INTEGER,

  transcript            TEXT,
  ai_summary            TEXT,
  ai_extracted          JSONB NOT NULL DEFAULT '{}'::jsonb,

  status                TEXT NOT NULL DEFAULT 'pending',
                        -- 'pending' | 'processed' | 'applied' | 'discarded' | 'failed'
  error                 TEXT,

  uploaded_by_user_id   UUID,
  uploaded_by_name      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_voice_inputs_org_idx
  ON contact_voice_inputs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_voice_inputs_contact_idx
  ON contact_voice_inputs (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_voice_inputs_client_idx
  ON contact_voice_inputs (client_id, created_at DESC);

ALTER TABLE contact_voice_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_voice_inputs_select" ON contact_voice_inputs
  FOR SELECT USING (org_id = public.get_user_org_id());
CREATE POLICY "contact_voice_inputs_insert" ON contact_voice_inputs
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
CREATE POLICY "contact_voice_inputs_update" ON contact_voice_inputs
  FOR UPDATE USING (org_id = public.get_user_org_id());
-- DELETE は付与しない: 原本は永続保持（誤認識検証のため）

-- 2) contact_memo_events.voice_input_id の FK（カラムは既存、制約のみ欠落）
-- 本番では TEXT 型で作られていたため UUID に矯正（適用時点で0件確認済）
ALTER TABLE contact_memo_events
  ALTER COLUMN voice_input_id TYPE UUID USING voice_input_id::uuid;

ALTER TABLE contact_memo_events
  ADD CONSTRAINT contact_memo_events_voice_input_fk
  FOREIGN KEY (voice_input_id) REFERENCES contact_voice_inputs(id) ON DELETE SET NULL;

-- 3) Storage バケット contact-audio (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-audio',
  'contact-audio',
  false,
  31457280,  -- 30MB
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- パス命名規約: {org_id}/{voice_input_id}.{ext}
CREATE POLICY "contact_audio_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contact-audio'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

CREATE POLICY "contact_audio_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'contact-audio'
    AND (storage.foldername(name))[1] = public.get_user_org_id()::text
  );

-- 上書き・削除禁止 — 原本永続保持の方針（UPDATE/DELETEポリシーは意図的に無し）
