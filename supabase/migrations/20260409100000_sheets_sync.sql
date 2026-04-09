-- ============================================================
-- クライアント向け Google Sheets リアルタイム同期
-- ============================================================
-- call_records への変更を sheet_sync_queue に積み、
-- pg_cron が30秒おきに edge function を呼んで該当リストの
-- スプレッドシートを全置換で同期する。
-- ============================================================

-- 必要な拡張
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ------------------------------------------------------------
-- client_sheets: クライアントごとのSpreadsheet紐付け
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_sheets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  spreadsheet_id  text NOT NULL,
  spreadsheet_url text NOT NULL,
  shared_with     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  last_synced_at  timestamptz,
  UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_client_sheets_org ON public.client_sheets(org_id);

ALTER TABLE public.client_sheets ENABLE ROW LEVEL SECURITY;

-- 同じorgのメンバーのみ閲覧・編集可能
DROP POLICY IF EXISTS client_sheets_org_all ON public.client_sheets;
CREATE POLICY client_sheets_org_all ON public.client_sheets
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

-- ------------------------------------------------------------
-- sheet_sync_queue: dirty listのキュー
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sheet_sync_queue (
  list_id       uuid PRIMARY KEY REFERENCES public.call_lists(id) ON DELETE CASCADE,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  attempts      int NOT NULL DEFAULT 0,
  last_error    text
);

ALTER TABLE public.sheet_sync_queue ENABLE ROW LEVEL SECURITY;
-- service_roleのみアクセス（クライアントから直接触らない）

-- ------------------------------------------------------------
-- トリガ: call_records 変更時にキューへ積む
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_sheet_sync_for_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
  v_client_id uuid;
  v_has_sheet boolean;
BEGIN
  v_list_id := COALESCE(NEW.list_id, OLD.list_id);
  IF v_list_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 同期対象のリスト（=client_sheetsが存在するクライアントのリスト）のみキューに積む
  SELECT cl.client_id INTO v_client_id FROM public.call_lists cl WHERE cl.id = v_list_id;
  IF v_client_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.client_sheets WHERE client_id = v_client_id) INTO v_has_sheet;
  IF NOT v_has_sheet THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.sheet_sync_queue(list_id, requested_at)
  VALUES (v_list_id, now())
  ON CONFLICT (list_id) DO UPDATE SET requested_at = EXCLUDED.requested_at;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_sheet_sync ON public.call_records;
CREATE TRIGGER trg_enqueue_sheet_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.call_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_sheet_sync_for_record();

-- call_list_items の変更でも同期したい（企業情報の編集など）
CREATE OR REPLACE FUNCTION public.enqueue_sheet_sync_for_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list_id uuid;
  v_client_id uuid;
  v_has_sheet boolean;
BEGIN
  v_list_id := COALESCE(NEW.list_id, OLD.list_id);
  IF v_list_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT cl.client_id INTO v_client_id FROM public.call_lists cl WHERE cl.id = v_list_id;
  IF v_client_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.client_sheets WHERE client_id = v_client_id) INTO v_has_sheet;
  IF NOT v_has_sheet THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  INSERT INTO public.sheet_sync_queue(list_id, requested_at)
  VALUES (v_list_id, now())
  ON CONFLICT (list_id) DO UPDATE SET requested_at = EXCLUDED.requested_at;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_sheet_sync_item ON public.call_list_items;
CREATE TRIGGER trg_enqueue_sheet_sync_item
  AFTER INSERT OR UPDATE OR DELETE ON public.call_list_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_sheet_sync_for_item();

-- ------------------------------------------------------------
-- pg_cron: 30秒ごとにedge functionをキック
-- ------------------------------------------------------------
-- 認証ヘッダーは ALTER DATABASE で設定する想定:
--   ALTER DATABASE postgres SET app.sheet_sync_secret = '<任意の長いランダム文字列>';
--   ALTER DATABASE postgres SET app.functions_url = 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1';
-- 設定後、 SELECT pg_reload_conf(); またはセッション再接続が必要。

CREATE OR REPLACE FUNCTION public.kick_sheet_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_has_dirty boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.sheet_sync_queue) INTO v_has_dirty;
  IF NOT v_has_dirty THEN RETURN; END IF;

  v_url := current_setting('app.functions_url', true);
  v_secret := current_setting('app.sheet_sync_secret', true);
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'sheet sync settings not configured (app.functions_url / app.sheet_sync_secret)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/sync-list-to-sheets',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END;
$$;

-- 既存ジョブがあれば削除して再登録
DO $$
BEGIN
  PERFORM cron.unschedule('sheet-sync-tick') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sheet-sync-tick'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sheet-sync-tick',
  '30 seconds',
  $$SELECT public.kick_sheet_sync();$$
);
