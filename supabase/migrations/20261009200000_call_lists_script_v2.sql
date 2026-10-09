-- 共通の台本（2026-10-09 むー様の基本台本）に差し込む、リストごとの違い。架電ページの台本タブで使う（ScriptV2.jsx）
alter table public.call_lists add column if not exists script_v2 jsonb;
