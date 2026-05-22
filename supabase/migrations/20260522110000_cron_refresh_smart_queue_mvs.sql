-- =====================================================================
-- pg_cron: スマートキュー mv を 5 分おきに自動 refresh
-- ---------------------------------------------------------------------
-- 経緯:
--   archiveCallList 直後の refreshSmartQueueMVs（fire-and-forget）が
--   何らかの理由（古いJS / ネットワークエラー / 競合）で失敗するケースの
--   保険として、サーバー側で定期 refresh する。
--   CONCURRENTLY 経由なので read は止まらない。
-- =====================================================================

-- 既存スケジュールがあればクリア（idempotent）
do $$
begin
  perform cron.unschedule('refresh_smart_queue_mvs_every_5min')
   where exists (
     select 1 from cron.job where jobname = 'refresh_smart_queue_mvs_every_5min'
   );
exception when others then null;
end $$;

select cron.schedule(
  'refresh_smart_queue_mvs_every_5min',
  '*/5 * * * *',
  $$SELECT public.refresh_smart_queue_mvs();$$
);
