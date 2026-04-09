-- ALTER DATABASEはMgmt API権限で実行できないため、設定をテーブルに保持する方式に変更
CREATE TABLE IF NOT EXISTS public._sheet_sync_config (
  id int PRIMARY KEY DEFAULT 1,
  functions_url text NOT NULL,
  sync_secret text NOT NULL,
  CHECK (id = 1)
);
ALTER TABLE public._sheet_sync_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public._sheet_sync_config(id, functions_url, sync_secret)
VALUES (1, 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1', '408efa0eba1f840ecd3b591f3b35f780e00b5d8d73df97df4606c00911a060d5')
ON CONFLICT (id) DO UPDATE SET functions_url = EXCLUDED.functions_url, sync_secret = EXCLUDED.sync_secret;

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
  SELECT functions_url, sync_secret INTO v_url, v_secret FROM public._sheet_sync_config WHERE id = 1;
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'sheet sync config missing';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/sync-list-to-sheets',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END;
$$;
