-- 社長の名前のふりがな（2026-10-08 むー様）：架電ページで社長名の上に小さく出す。
-- AI が推定した読み（kana_source='ai'）と、インターンが電話で確かめて直した読み（'confirmed'）を分ける。
-- 社長名の確認（gBizINFO・HP）：いつ・どこで確かめたか
alter table public.call_list_items
  add column if not exists representative_kana text,
  add column if not exists representative_kana_source text,
  add column if not exists representative_checked_at timestamptz,
  add column if not exists representative_source text;
insert into public.internal_cron_tokens (name) values ('name-kana') on conflict do nothing;

-- 5分おきに、ふりがなの無い会社を最大2,000社ずつ推定する（新しく入ったリストの会社もこれで付く）
select cron.unschedule('name-kana') where exists (select 1 from cron.job where jobname = 'name-kana');
select cron.schedule('name-kana', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://baiiznjzvzhxwwqzsozn.supabase.co/functions/v1/name-kana',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', (select token from public.internal_cron_tokens where name = 'name-kana')),
    body := '{"limit":2000}'::jsonb, timeout_milliseconds := 150000);
$$);

-- 確かめた結果、リストと違う現在の代表者名（gBizINFOなど）
alter table public.call_list_items add column if not exists representative_current text;
