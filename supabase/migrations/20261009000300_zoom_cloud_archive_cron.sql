-- Zoomのクラウド録画を毎時R2へ移す（2026-10-09 むー様「はい」）
-- 新しい録画を記録→R2へ移す→14日より前のものだけZoomのゴミ箱へ（関数 zoom-cloud-archive の auto）。
-- 合言葉は Vault の zoom_cloud_archive_secret（値はリポジトリに置かない）。
select cron.unschedule('zoom-cloud-archive-hourly') where exists (select 1 from cron.job where jobname = 'zoom-cloud-archive-hourly');
select cron.schedule('zoom-cloud-archive-hourly', '17 * * * *', $$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/zoom-cloud-archive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_7bp3dRku_KpnDKZ01mCTbw_QgaFZUp8',
      'apikey', 'sb_publishable_7bp3dRku_KpnDKZ01mCTbw_QgaFZUp8',
      'x-archive-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'zoom_cloud_archive_secret')
    ),
    body := '{"action":"auto"}'::jsonb,
    timeout_milliseconds := 300000
  );
$$);
