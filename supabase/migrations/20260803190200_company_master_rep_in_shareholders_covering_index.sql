-- 企業DB検索がタイムアウトする件の対処（2/2）。本命はこちら。
--
-- 症状: 都道府県＋売上高＋当期純利益＋代表者年齢＋株主タイプ＋代表・株主一致 の検索が
--       17秒かかり「canceling statement due to statement timeout」になる（authenticated は8秒）。
--
-- 原因: 旧 company_master_rep_in_shareholders_financial_idx は (net_income_k, revenue_k) しか持たない。
--       btree なので範囲条件で効くのは先頭列だけ、つまり「純利益が閾値以上」の43,000件が索引から出てくる。
--       都道府県・代表者年齢・株主タイプはその43,000件について本体テーブルを1行ずつ読んで判定していた。
--       ランダム読みは1回0.33ms（=IOPSの上限）なので、43,000回で約16秒。関数の重さではなくディスクIOが支配的。
--       しかもプランナはこの索引で「3行しか出ない」と見積もっており（実際43,000件）、
--       他の索引に切り替わることもなかった。
--
-- 対処: 絞り込みに使う列を索引に載せて index only scan にし、本体テーブルを読まずに判定させる。
--       実測: 報告された条件 17.9秒 → 0.14秒 / 大分類＋代表株主一致＋売上 12.3秒 → 0.23秒 /
--             代表株主一致のみ 0.15秒。索引サイズ36MB（旧2本の28MBと入れ替え）。
--       index only scan は可視性マップに依存するので、大量更新の直後は VACUUM が必要。
set local search_path = public, pg_catalog;

-- 載せる列＝検索パネルの絞り込み項目のうち company_master 上のスカラー列すべて。
-- 業種を外すと「大分類＋代表・株主一致＋売上」が同じ理由で12秒かかる（実測）ので必ず含める。
create index if not exists company_master_rep_in_shareholders_cover_idx
  on public.company_master
  (net_income_k, revenue_k, prefecture, city, industry_major, industry_sub,
   representative_age, shareholder_type, employee_count, established_year, id)
  where (representative is not null and shareholders is not null
         and replace(replace(shareholders, '　', ''), ' ', '')
             like '%' || replace(replace(representative, '　', ''), ' ', '') || '%');

-- 旧索引は上位互換になったため撤去する。
-- 残すとプランナが「安く見える」旧索引を選び続け、遅いプランに戻ってしまう。
drop index if exists public.company_master_rep_in_shareholders_financial_idx;
drop index if exists public.company_master_rep_in_shareholders_id_idx;

-- index only scan は可視性マップに依存するので、大量更新の直後は VACUUM しておく
vacuum (analyze) public.company_master;
