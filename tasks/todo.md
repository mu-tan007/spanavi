# 案件「各企業のアプローチ詳細」に法人番号・ID列を追加（2026-09-14）

依頼: レバレジーズM&Aアドバイザリー様。物流リストの詳細画面とExcel出力で、企業名の右に「法人番号」、その右に「ID（クライアント付与）」を出す。

現状: `call_list_items` に法人番号の列は無く、取込時に未マッピング列として `memo` のJSON（`{"No":"1","法人番号":"6100001009495"}`）に入っている。物流3,580社は全件13桁で入っている。

- [x] 1. DB: `call_list_items.corporate_number` / `client_ref_id` を追加し、memoの13桁法人番号を埋め戻す（lock_timeout付き）
- [x] 2. DB: `sourcing_list_approach_detail` に2列を追加（戻り型が変わるのでDROP→CREATE）
- [x] 3. 取込: `csvImportUtils` の TARGET_FIELDS / detectField / buildRowsFromMapping に2フィールド追加、`insertCallListItems` で書き込み、紐付けモーダルのプレビューにも表示
- [x] 4. 画面/CSV: `ListApproachPage` に法人番号列（常時）とID列（1件でも値があれば）を企業名の右に追加。CSVも同じ並び。絞り込みも法人番号・IDで効くように
- [x] 5. テスト追加（detectField / buildRowsFromMapping）→ vitest → build
- [ ] 6. commit（触ったパスだけ）→ push → 本番画面で確認

## 見送り
- memo内で `4.01E+12` のように指数表記で壊れている434行（他リスト）は復元不能。元ファイルからの再取込が必要
