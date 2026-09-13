-- An expression index keeps the result up to date on both import and address edits.
-- No backfill UPDATE is needed, so existing sheet-sync triggers are not fired.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
CREATE INDEX IF NOT EXISTS idx_cli_list_address_match_no
  ON public.call_list_items (list_id, public.company_address_match(call_list_items), no);
