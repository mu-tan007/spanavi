-- ============================================================
-- call_list_items.call_status を call_records から自動同期するトリガ
-- ------------------------------------------------------------
-- 経緯:
--   再コール一覧 (fetchAllRecallRecords) は call_list_items.call_status が
--   その企業の「直近架電結果」と一致している前提で「直近=再コール」を判定
--   する設計に変更した (2026-05-09)。
--   ただし call_records への INSERT は await されるが、その直後に呼ばれる
--   updateCallListItem(...) は fire-and-forget (.catch でログのみ) のため、
--   ネットワーク失敗時に call_list_items.call_status だけが古いまま残る
--   ケースが理論上残っていた。
--
--   この migration では call_records への INSERT 後に「最新行ならば
--   call_list_items.call_status / called_at を上書き」する AFTER INSERT
--   トリガを追加し、クライアント側の更新失敗に依存しないようにする。
--
--   さらに既存ズレ (例: アポ獲得済みなのに call_status が再コールのまま等)
--   を一括修復する backfill を末尾に実行する。
--
-- 副作用:
--   call_records.insert 1件あたり SELECT 1 + UPDATE 1 が増える。
--   架電一括時の体感影響は無視できる程度。
--
--   is_excluded はクライアント側のロジック (EXCLUDED_STATUSES の集合判定)
--   と一致させる必要があり、トリガでは扱わない。
-- ============================================================

set local search_path = public, extensions;

create or replace function public.sync_call_list_items_from_call_record()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.item_id is null then
    return new;
  end if;

  -- 「この行が item の最新か」を round → called_at の優先順で判定
  -- (out-of-order insert があっても古い結果で上書きしないように)
  if exists (
    select 1
    from call_records
    where item_id = new.item_id
      and id <> new.id
      and (
        coalesce(round, 0) > coalesce(new.round, 0)
        or (
          coalesce(round, 0) = coalesce(new.round, 0)
          and coalesce(called_at, '-infinity'::timestamptz)
              > coalesce(new.called_at, '-infinity'::timestamptz)
        )
      )
  ) then
    return new;
  end if;

  update call_list_items
  set call_status = new.status
  where id = new.item_id
    and call_status is distinct from new.status;

  return new;
end;
$$;

drop trigger if exists trg_sync_call_list_items_from_call_record on call_records;
create trigger trg_sync_call_list_items_from_call_record
after insert on call_records
for each row
execute function public.sync_call_list_items_from_call_record();

-- ============================================================
-- 既存ズレを一括修復 (backfill)
--   各 item_id について call_records の最新行を確定させ、
--   call_list_items.call_status と乖離していれば真値に書き直す。
-- ============================================================
with latest as (
  select distinct on (item_id)
    item_id,
    status
  from call_records
  where item_id is not null
  order by
    item_id,
    coalesce(round, 0) desc,
    called_at desc nulls last
)
update call_list_items cli
set call_status = l.status
from latest l
where cli.id = l.item_id
  and cli.call_status is distinct from l.status;
