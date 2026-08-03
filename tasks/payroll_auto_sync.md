# 確定済み報酬スナップショットのアポ連動自動再計算（2026-08-03）

## 背景

2026-07 分の報酬は 7/31 に確定済み（`payroll_snapshots`）。その後アポ一覧で
「株式会社LST / 株式会社長谷工不動産（面談日 7/8・¥110,000・取得者 瀬尾 貫太）」を
面談済 → キャンセルに変更したが、報酬ページは確定スナップショットを表示するため
瀬尾の今月売上が ¥880,000 のまま（正しくは ¥770,000）。アナリティクスはライブ計算なので減っている。

現状これを直す手段は報酬ページの「再計算」ボタンだけで、押し忘れると差が残り続ける。

## 方針（むー様決定）

アポのステータス・面談日・売上が変わった時点で、確定済み月のスナップショットを自動で引き直す。
締め／支払済みロックは設けない（過去月も追従する）。

## やること

- [x] 1. `src/utils/payrollRecalc.js` を新設し、`PayrollView.jsx:367-423` の
      recalcRows / recalcDiffs 構築ロジックを純粋関数 `buildRecalcRows()` として抽出
      （チーム・役職・ランク・適用率・紹介フィーは確定時のまま固定し、金額のみ更新するルールを保持）
- [x] 2. `PayrollView.jsx` を 1 の関数を使う形に置き換える（手動ボタンと自動再計算のロジックを一本化）
- [x] 3. `src/lib/payrollAutoSync.js` を新設
      - 対象月の `payroll_snapshots` を見て、未確定なら何もしない（ライブ計算で自動反映されるため）
      - 対象月のアポ・メンバー・架電リスト・org_settings を **DBから直接** 取得して計算
        （画面が読み込み済みの appoData に依存しない＝取得件数上限の影響を受けない）
      - 差分がある時だけ `upsertPayrollSnapshots`。`recalculated_at` を打つ
      - 月単位のデバウンス（一括ステータス更新のループで何度も走らせない）
- [x] 4. `supabaseWrite.js` の書込口 4 箇所に呼び出しを追加
      - `updateAppointment` :659（更新前の meeting_date を取得し、旧月と新月の両方を対象にする）
      - `updatePreCheckResult` :960
      - `insertAppointment` :870-947（新規・冪等UPDATE の両方）
      - `deleteAppointment` :976
- [x] 5. 再計算が走ったら `console.info` とカスタムイベントを飛ばし、
      報酬ページを開いている場合はスナップショットを再取得して表示を更新
- [x] 6. `src/utils/payrollRecalc.test.js` を追加（vitest）。既存 `money.test.js` と同じ流儀で、
      キャンセルで減る／新規メンバー行が増える／確定時の役職とチームが保持される を固定
- [x] 7. `npm run build` と `npx vitest run` で検証
- [x] 8. 7月分を実データで検証（瀬尾 ¥880,000 → ¥770,000、インセンティブ ¥211,200 → ¥184,800、
      リーダーボーナスの連動も確認）してから commit & push

## 補足

- `payroll_snapshots` の RLS は `org_id` 一致のみで、一般メンバーでも UPDATE できる状態。
  今回の自動化はこの緩さの上に乗るため、別途厳格化を提案する（本タスクの範囲外）。

## レビュー

### 作ったもの

- `src/utils/payrollRecalc.js` — 再計算の行組み立て（純粋関数）。`buildRecalcRows()` /
  `buildSnapshotMembers()` / `buildSnapshotRoleMap()`。報酬ページの「再計算」ボタンと
  自動再計算がこの1本を共有する。
- `src/lib/payrollAutoSync.js` — アポ更新時に走る自動再計算。対象月のデータをDBから取り直し、
  差分がある時だけ `payroll_snapshots` を upsert。月単位で1.2秒デバウンス。
- `PayrollView.jsx` — 再計算の useMemo 4本（86行）を `buildRecalcRows` 呼び出し1本に置換。
  自動再計算のイベントを受けてスナップショットを取り直す useEffect を追加。
- `PayrollSelfDetailView.jsx` — 同じくイベントで取り直す。
- `supabaseWrite.js` — `updateAppointment` / `updatePreCheckResult` / `insertAppointment` /
  `deleteAppointment` の4関数に予約を追加。面談日が月をまたいだ場合に備え、
  更新前の `meeting_date` を読んでから書き換える。

### 検証

- `npx vitest run` 79件パス（うち新規11件）。`npm run build` 成功。
- 2026-07 の実データで、自動再計算が使うのと同じ条件（面談日が日本時間の7月・
  status が アポ取得/事前確認済/面談済・開拓リストは売上0）で集計した結果が、
  現在のスナップショット11名分と完全一致することを SQL で確認。
  ＝この状態で自動再計算が走っても差分ゼロで書き込みが起きない（誤爆しない）。
- 長谷工のキャンセル分は、会話中にむー様が「再計算」ボタンを押されて反映済み
  （`recalculated_at` = 2026-08-03 09:10 JST）。瀬尾 ¥880,000 → ¥770,000、
  インセンティブ ¥211,200 → ¥184,800、役職ボーナスも連動して 23,496 → 22,836。

### 積み残し

- `payroll_snapshots` の RLS が `org_id` 一致のみで、一般メンバーでも自分の `total_payout` を
  書き換えられる。`payroll_invoices` / `payroll_member_adjustments` は本人＋管理者判定が
  入っているので、ここだけ緩い。自動化とは独立した既存の穴。
- 請求書を出したあとに金額が動いた場合、手動の「再計算」ボタンには警告ダイアログが出るが、
  自動再計算では出ない。必要なら請求書格納済みの月だけ通知を足す。
