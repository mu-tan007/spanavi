-- =====================================================================
-- スマートキュー: 二重架電防止インフラの修復
--
-- 問題:
--   1. refresh_smart_queue_mvs() が mv_excluded_items を MV として refresh
--      しようとしていた。 実体はテーブル化済 → "is not a materialized view"
--      エラーで pg_cron 5分 job が全失敗していた
--   2. mv_excluded_items 同期 trigger が存在しなかった
--      （以前のmigrationでコメントだけ残されていた）
--
-- 修正:
--   1. refresh_smart_queue_mvs() から mv_excluded_items の refresh を除去
--   2. call_records INSERT/UPDATE 時に mv_excluded_items を即時 upsert する
--      trigger trg_sync_excluded_items を新設
--   3. 念のため call_records から missing 分を backfill（冪等）
-- =====================================================================

set local search_path = public, extensions;

-- 1) refresh function 修正
create or replace function public.refresh_smart_queue_mvs()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  refresh materialized view concurrently public.mv_latest_call_records;
  refresh materialized view concurrently public.mv_smart_queue_base;
  refresh materialized view concurrently public.mv_industry_time_score;
end;
$$;

-- 2) 同期 trigger
create or replace function public.sync_excluded_items_from_call_record()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.item_id is null then
    return new;
  end if;

  if new.status in ('アポ獲得','除外') then
    insert into mv_excluded_items (org_id, item_id, status, excluded_at)
    values (new.org_id, new.item_id, new.status, coalesce(new.called_at, now()))
    on conflict (org_id, item_id) do update
      set status      = excluded.status,
          excluded_at = excluded.excluded_at
      where mv_excluded_items.excluded_at <= excluded.excluded_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_excluded_items on public.call_records;
create trigger trg_sync_excluded_items
after insert or update of status on public.call_records
for each row execute function public.sync_excluded_items_from_call_record();

-- 3) backfill（冪等）
insert into mv_excluded_items (org_id, item_id, status, excluded_at)
select distinct on (cr.org_id, cr.item_id)
       cr.org_id, cr.item_id, cr.status, cr.called_at
from call_records cr
where cr.status in ('アポ獲得','除外')
  and cr.item_id is not null
order by cr.org_id, cr.item_id, cr.called_at desc
on conflict (org_id, item_id) do nothing;
