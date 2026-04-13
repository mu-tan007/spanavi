-- =====================================================
-- Fix: リスト追加/削除トリガーに SECURITY DEFINER を追加
-- sheet_sync_queue は RLS 有効・ポリシーなし（service_role 専用）のため、
-- トリガー関数も SECURITY DEFINER で実行する必要がある。
-- =====================================================

CREATE OR REPLACE FUNCTION enqueue_sheet_sync_for_list_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_sheet boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.client_sheets WHERE client_id = NEW.client_id) INTO v_has_sheet;
  IF NOT v_has_sheet THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.sheet_sync_queue(list_id, requested_at)
  VALUES (NEW.id, now())
  ON CONFLICT (list_id) DO UPDATE SET requested_at = EXCLUDED.requested_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_sheet_tab_delete_for_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spreadsheet_id text;
  v_suffix text;
BEGIN
  SELECT cs.spreadsheet_id INTO v_spreadsheet_id
  FROM public.client_sheets cs WHERE cs.client_id = OLD.client_id;
  IF v_spreadsheet_id IS NULL THEN
    RETURN OLD;
  END IF;
  v_suffix := COALESCE(NULLIF(OLD.industry, ''), NULLIF(OLD.name, ''), 'リスト');
  v_suffix := regexp_replace(v_suffix, '[\[\]*?/\\:]', '_', 'g');
  v_suffix := left(v_suffix, 90);

  INSERT INTO public.sheet_tab_delete_queue(spreadsheet_id, tab_name, requested_at)
  VALUES
    (v_spreadsheet_id, 'リストデータ_' || v_suffix, now()),
    (v_spreadsheet_id, 'レポート_' || v_suffix, now());

  DELETE FROM public.sheet_sync_queue WHERE list_id = OLD.id;
  RETURN OLD;
END;
$$;
