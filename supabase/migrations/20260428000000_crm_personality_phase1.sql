-- ============================================================
-- CRM 強化 Phase 1 — 担当者性格管理 + 音声入力基盤
-- ------------------------------------------------------------
-- 既存データは一切毀損しない。すべて追加のみ。
--
-- 変更内容:
-- 1) client_contacts に is_primary 追加（既存行は false → 主担当 1 名を後でバックフィル）
-- 2) contact_memo_events: 担当者ごとの追記専用メモログ（AI 整理済み or 手書き）
-- 3) contact_voice_inputs: 音声録音 + 文字起こし + AI 整理結果の永続保持
-- 4) Storage バケット contact-audio: 録音ファイル本体の保存（private）
-- ============================================================

-- ------------------------------------------------------------
-- 1) client_contacts.is_primary
-- ------------------------------------------------------------
ALTER TABLE client_contacts
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- 1 クライアントにつき主担当は最大 1 名。
-- 部分 unique index で「true の行が複数」を構造的に禁止する（NULL/false は無制限）。
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_one_primary_per_client
  ON client_contacts (client_id)
  WHERE is_primary = TRUE;

-- バックフィル: 各クライアントについて、最も古く登録された担当者を主担当に。
-- 既存に主担当が居る場合は変更しない。
WITH ranked AS (
  SELECT
    id,
    client_id,
    ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at, id) AS rn
  FROM client_contacts
),
needs_primary AS (
  -- 主担当がまだ 1 人も居ないクライアントだけを対象
  SELECT DISTINCT client_id
  FROM client_contacts
  WHERE client_id NOT IN (
    SELECT client_id FROM client_contacts WHERE is_primary = TRUE
  )
)
UPDATE client_contacts c
SET is_primary = TRUE
FROM ranked r
WHERE c.id = r.id
  AND r.rn = 1
  AND c.client_id IN (SELECT client_id FROM needs_primary);

-- ------------------------------------------------------------
-- 2) contact_memo_events — 担当者メモ（追記専用）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_memo_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES client_contacts(id) ON DELETE CASCADE,
  body_md             TEXT NOT NULL,
  raw_transcript      TEXT,
  voice_input_id      UUID,
  source              TEXT NOT NULL DEFAULT 'manual',
                      -- 'manual'    : 手入力（AI 整理なし）
                      -- 'voice_ai'  : 音声 → AI 整理
                      -- 'voice_raw' : 音声 → 整理せず原文添付
                      -- 'manual_ai' : 手入力 → AI で整理
  extracted           JSONB NOT NULL DEFAULT '{}'::jsonb,
  author_user_id      UUID,
  author_name         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_memo_events_contact_idx
  ON contact_memo_events (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_memo_events_org_idx
  ON contact_memo_events (org_id, created_at DESC);

ALTER TABLE contact_memo_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_memo_events_select" ON contact_memo_events
  FOR SELECT USING (org_id = public.get_user_org_id());
CREATE POLICY "contact_memo_events_insert" ON contact_memo_events
  FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
-- 追記専用: UPDATE / DELETE はポリシー未付与 = RLS で全拒否（admin 経由のみ）

-- ------------------------------------------------------------
-- 3) contact_voice_inputs — 音声入力ログ（原本永続保持）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_voice_inputs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- 対象は「担当者メモ」「クライアント情報更新」「新規顧客追加」のいずれか
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
                        -- 'pending'   : 録音アップロード済み・処理待ち
                        -- 'processed' : Whisper + Claude 完了
                        -- 'applied'   : ユーザーが差分プレビューで確定し DB 反映済み
                        -- 'discarded' : ユーザーが破棄
                        -- 'failed'    : 処理失敗
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

-- contact_memo_events.voice_input_id を contact_voice_inputs に FK 接続
-- （テーブル作成順の都合で後付け）
ALTER TABLE contact_memo_events
  ADD CONSTRAINT contact_memo_events_voice_input_fk
  FOREIGN KEY (voice_input_id) REFERENCES contact_voice_inputs(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 4) Storage バケット contact-audio (private)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-audio',
  'contact-audio',
  false,
  31457280,  -- 30MB（5分 x 高音質想定）
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- 認証済みユーザーは自分の org のフォルダにアップロード可能。
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

-- 上書き禁止 (削除も禁止) — 原本永続保持の方針
-- UPDATE / DELETE ポリシーは意図的に付与しない
