-- 社長の温度感を付ける関数を10分ごとに回す（新しいキーマン断りに付ける）
insert into public.internal_cron_tokens (name) values ('judge-ceo-temp') on conflict do nothing;
select cron.unschedule('judge-ceo-temp') where exists (select 1 from cron.job where jobname = 'judge-ceo-temp');
select cron.schedule('judge-ceo-temp', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/judge-ceo-temp',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', (select token from public.internal_cron_tokens where name = 'judge-ceo-temp')),
    body := '{"limit":120}'::jsonb, timeout_milliseconds := 150000);
$$);
