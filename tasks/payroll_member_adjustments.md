# 請求書 任意調整項目（ボーナス/控除）対応

## 背景
請求書自動生成は現在「インセンティブ / 役職ボーナス / 紹介料」の3種類のみ自動集計。
イレギュラー対応（特別ボーナス +¥10,000、研修費控除 -¥5,000 等）の追記ができないので、
メンバー × 月 単位で自由に項目を追加できるようにする。

## スコープ（むー様 確認済）
- 編集権限: 本人 + admin の両方が追加・編集・削除可
- 符号: プラスもマイナスも可（控除も想定）
- 反映: 給与画面サマリー（合計支給額に加算） + 請求書PDF明細
- 件数: 1 メンバー × 1 月 で複数項目OK

## DB（Supabase 本番 baiiznjzvzhxwwqzsozn）

新規テーブル `public.payroll_member_adjustments`

- [ ] migration ファイル作成
- [ ] MCP `apply_migration` で本番反映
  - 既存 `payroll_adjustments`（org 全体の月次ディスカウント）とは別物
  - カラム: id, org_id, member_id, pay_month (YYYY-MM), label, amount (int, +/-可), note, created_by, created_at, updated_at
  - index: (org_id, member_id, pay_month)
  - RLS: SELECT/INSERT/UPDATE/DELETE 共に 本人 or admin

## supabaseWrite.js
- [ ] `fetchMemberPayrollAdjustments(memberId, payMonth)` → 配列
- [ ] `insertMemberPayrollAdjustment({ memberId, payMonth, label, amount, note })`
- [ ] `updateMemberPayrollAdjustment(id, patch)`
- [ ] `deleteMemberPayrollAdjustment(id)`

## PayrollView.jsx
- [ ] PayrollSelfDetailView に `isAdmin` prop を渡す（self も drill-down も）

## PayrollSelfDetailView.jsx
- [ ] `isAdmin` prop を受ける。canEditAdjustments = canEdit || isAdmin
- [ ] `useEffect` で当月の adjustments を fetch（依存: memberId, payMonth）
- [ ] `adjustmentTotal` を計算 → `totalPayout = incentive + roleBonus + referralTotal + adjustmentTotal`
- [ ] サマリーカード 4 枚 → 5 枚（④調整 を追加、grid 5 列）
- [ ] 「④調整明細」セクション追加
  - 既存の Card + DataTable パターンで一覧表示
  - 列: 項目名 / 金額(±) / メモ / 削除
  - 「+ 項目を追加」ボタン → 行追加してインライン編集（label / amount / note）
  - 保存は debounce or blur で自動 upsert（既存 `useEffect` 自動保存パターンに合わせる）

## PayrollInvoiceGenerator.jsx
- [ ] `adjustments` prop を受け取る
- [ ] `invoiceItems` に adjustments をマージ（label にメモがあれば併記）
- [ ] 既存の `validateProfile` の「当月の支給対象がありません」判定は items.length で見ているので、調整項目だけでも生成可能（変更不要）

## PDF (MemberInvoicePDF.jsx)
- [ ] amount に負数を渡しても `toLocaleString` で `-10,000` 表記されるので変更不要

## 検証
- [ ] ローカル dev で動作確認（add / edit / delete / PDF 反映）
- [ ] 本番反映後、むー様の自分のページで1件作って確認

## レビュー
（実装後に追記）
