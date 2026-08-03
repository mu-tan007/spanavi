-- 企業DB検索で「株主タイプ」を他の条件と組み合わせるとタイムアウトする件の対処（1/2）。
--
-- 従来は WHERE 句で classify_shareholder_type(cm.shareholders) を行ごとに評価していた。
-- 関数呼び出し自体の重さより問題なのは、算出値が索引に載せられないこと。
-- そのため絞り込みのたびに本体テーブルの行を読む必要があり、
-- 数万行に掛かると数万回のランダムディスク読み込みになっていた。
--
-- 株主タイプは shareholders 欄から一意に決まる派生値なので、
-- normalized_name / normalized_representative と同じく列として保持し、
-- 既存の BEFORE INSERT/UPDATE トリガ trg_normalize_company で維持する。
-- 索引に載るようになるのが本質（続きは 20260803190200 の被覆索引）。

set local search_path = public, pg_catalog;

-- 1) 派生列（既定NULL＝テーブル書き換えなしで即時追加）
alter table public.company_master
  add column if not exists shareholder_type text;

comment on column public.company_master.shareholder_type is
  'classify_shareholder_type(shareholders) の算出結果（individual/corporate/mixed/empty）。trg_normalize_company が維持する';

-- 2) トリガで維持する。shareholders が変わったときだけ再計算する
--    （リスト取込のたびに全行 0.4ms を払わないため）
create or replace function public.trg_normalize_company()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog'
as $function$
begin
  new.normalized_name := normalize_company_name_master(new.company_name);
  new.normalized_representative := normalize_person_name(new.representative);
  if tg_op = 'INSERT' or new.shareholders is distinct from old.shareholders then
    new.shareholder_type := classify_shareholder_type(new.shareholders);
  end if;
  return new;
end;
$function$;

-- 3) 既存49万行のバックフィル。
--    本番では id レンジで5万〜12万行ずつに分けて流した（一括だと十数分の長トランザクションになる）。
--      update public.company_master
--         set shareholder_type = classify_shareholder_type(shareholders)
--       where id between :from and :to and shareholder_type is null;
--    shareholder_type IS NULL 条件があるので、済んでいる環境で再実行しても何もしない。
update public.company_master
   set shareholder_type = classify_shareholder_type(shareholders)
 where shareholder_type is null;

-- 4) 株主タイプ単独での件数取得を index only scan で返すための索引
create index if not exists idx_cm_shareholder_type
  on public.company_master using btree (shareholder_type);

analyze public.company_master;
