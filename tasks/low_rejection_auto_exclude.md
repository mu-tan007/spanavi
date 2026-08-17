# 温度感LOWのキーマン断りを自動除外（2026-08-17）

## 背景

案件ページで株式会社SECURITY BRIDGE の架電結果を見ると、キーマン接続数94件に対し
再アプローチ候補が49件で乖離していた。調査したところ2段階の絞り込みによるものだった。

- キーマン接続数 = キーマン断り＋キーマン再コール＋アポ獲得（`call_statuses` の `keyman_connect: true`）
- 再アプローチ候補 = キーマン断りのうち AI 分析済み（`rejection_reason` 入り）のみ

そのうえで「AI判定が LOW のものは架電リストからも自動で外したい」という要望。適用は SECURITY BRIDGE のみ。

## 実装

- [x] `clients.auto_exclude_low_rejection` を追加（クライアント編集フォームから切替）
- [x] トリガ `trg_sync_low_rejection_exclusion`（`call_records.rejection_reason` の更新を拾う）
- [x] `mv_excluded_items` と `call_list_items.is_excluded` の両方へ書き込み
- [x] 既存分43件をバックフィル
- [x] `client_keyman_rejections` から除外済みを落とす
- [x] 架電画面 `CallFlowView` の `excludedItemSet` に `is_excluded` を合流
- [x] 架電結果保存時の `is_excluded` 再計算で AI 除外が解除されないよう修正

## 調査で判明した構造（重要）

**架電対象から外す実体は `mv_excluded_items` テーブル**（名前は mv だが実テーブル）。
ここに入ると `mv_smart_queue_base` から落ち、スマートキューの全パネルから消える。

一方 `call_list_items.is_excluded` は CallFlowView の表示用フラグでしかなく、
架電可能の判定には使われていなかった。しかも架電結果を保存するたびに
`call_records` のステータスから再計算して上書きするため、外部から立てても次の架電記録で false に戻る。
→ この2点を直さないと「除外したのに架電され続ける」状態になっていた。

`mv_smart_queue_base` は pg_cron で15分ごと（毎時 8,23,38,53分）にリフレッシュされる。

## レビュー

- 適用範囲の担保を確認: フラグOFFのクライアントの LOW 7,224件は1件も除外されていない
- 集計への影響なし: キーマン接続数は `call_records` ベースなので除外の影響を受けない
- トリガの動作を実データで確認（1件を戻して `rejection_reason` を再UPDATE → 再投入されること）
- 戻すときは `exclude_reason='AI判定:温度感低'` を目印に一括で戻せる

## 残件（むー様判断待ち）

- 未分析の断り（録音ありは分析待ち、録音なし1件は永久に埋まらない）
- クライアント二重登録の統合（今回は「触らない」判断）
