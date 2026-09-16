# 企業リスト取込が statement timeout で止まる（2026-09-16）

## 症状
`依頼リスト　ファンドサーチ_業種指定なし_主要都市限定　20260908.xlsx`（2,686行）の取込が
1,525行で `canceling statement due to statement timeout` を出して停止。再開しても同じ位置で落ちる。

## 調べたこと
- batch `edccad89…`: total 2686 / processed 1525、03:41:44〜03:44:48。
- 1チャンク（25行）の実測は一貫して **2.9秒**。行数が増えても伸びていない＝取込側の設計は問題なし。
- 失敗チャンクは 03:44:51 頃に開始し **8秒**で打ち切られた（authenticated ロールの statement_timeout は8秒）。
- 同じ時間帯に cron **job 39 `refresh_mv_company_call_status`** が 03:41:00〜03:45:00 を占有して timeout 死。
- `cron.job_run_details`: job 39 は直近3日で **288回中288回 failed**（毎回4分走って死ぬ）。
- `mv_refresh_log`: `mv_company_call_status` の最終成功は **2026-07-22 12:11**。約8週間、15分ごとに
  「絶対に終わらない4分クエリ」を流し続けている＝常時27%の時間、DBが飽和している。
- 同じ落ち方は前日の `架電リスト_民泊管理業者.csv`（700/1688で停止）にも出ている。

## 直したこと（クライアント側・commit 予定）
`src/lib/companyImportApi.js` の `executeCompanyImport` に再試行を入れた。
- statement timeout / デッドロック / 接続断（57014, 40001, 40P01, 53300, 08006 ほか）を一時的な失敗として扱う
- 失敗したチャンクは **半分に縮めて**再送（25 → 12 → 6 …、下限5行）。成功するたび25行へ戻す
- 指数バックオフ 0.5s→1s→2s→4s→8s、最大5回
- 再試行の前に `get_company_import_job` で確定済み位置を読み直す（サーバーは25行を1トランザクションで
  コミットし、既登録行は行番号で弾くので同じ行を送り直しても二重登録にならない）
- 使い切ったときは「◯行目までは登録済みです。しばらく待ってから取込を再開してください」と日本語で返す

テスト `src/lib/companyImportApi.test.js` に3本追加（timeout時の縮小と復帰／応答喪失時に同じ行を送り直さない／
再試行を使い切ったときの文言）。7本パス。

## cron job 39（対応済み・2026-09-16）
むー様の判断＝「夜間1回に落とす」。`cron.alter_job(39, schedule => '40 18 * * *')`（18:40 UTC = 03:40 JST）を適用。
- MVは2026-07-22から更新されていないので、頻度を落としても企業DBの「架電ステータス」絞り込みの中身は変わらない。
- 日中の常時負荷（15分のうち4分＝27%）だけが消える。
- **jobnameは `refresh_mv_company_call_status_15min` のまま**（cron.job へのUPDATEは権限が無い）。名前と実際の
  スケジュールがずれている点に注意。unschedule/schedule で振り直すと jobid と履歴が変わるので触っていない。

## 残（別途・要判断）
- MVの作り直しを速くして15分更新へ戻すか。ボトルネックは keyed 226,017行 → `company_master` 491,292行への
  **226k回の index probe**（`idx_cm_normname_phone` + heap fetch）。`enable_hashjoin=off` のヒントは
  2026-07-22時点の規模で決めたもので、今の規模には合っていない。
  正攻法は company_master に正規化済みの社名・電話を生成列で持たせ、素の btree でハッシュ結合させること
  （`spanavi_norm_company` は SQL関数で、491,292行の素の評価は実測20秒。生成列にすれば0秒）。
  company_master は1.3GBなので列追加は低負荷時に。
- それまで企業DBの「架電ステータス」絞り込みは8週間前のデータで動いている点を運用側に共有しておく。
