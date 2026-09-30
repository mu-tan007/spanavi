-- スパキャリ営業の Slack 報告を15分ごとに取り込む（spacareer-sales-slack-sync）。
-- 他の cron と重ならないよう 2,17,32,47 分に回す。
select cron.unschedule('spacareer-sales-slack-sync')
 where exists (select 1 from cron.job where jobname = 'spacareer-sales-slack-sync');

select cron.schedule(
  'spacareer-sales-slack-sync',
  '2,17,32,47 * * * *',
  $cron$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/spacareer-sales-slack-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhaWl6bmp6dnpoeHd3cXpzb3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODk2NzQsImV4cCI6MjA4Njg2NTY3NH0.ZKo6JH3R3K0STIbRkVaCXe_V6R22zZsVhQx62Bl7J_g'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
