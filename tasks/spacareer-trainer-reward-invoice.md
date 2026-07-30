# スパキャリ トレーナー報酬・請求書 設計

作成: 2026-07-30 / むー様依頼

## 背景（確認済みの現状）

セッション実施回数のトレーナー帰属が **「顧客の現担当（`spacareer_customers.assigned_trainer_id`）」の後付け** になっている。
担当が変わると過去の全セッションが新担当の実績に付け替わる。

| 箇所 | 内容 |
|---|---|
| `SessionRecordsView.jsx:14,52` | 集計時に `c.assigned_trainer_id` を貼っている（コメントにも明記） |
| `SpacareerSessionsView.jsx:64` | 同上 |
| `useSessionCompletion.js:95-96` | 完了時に `status` と `completed_at` しか書いていない |
| `spacareer_sessions.completed_by` | カラムは存在するが完了49件すべて NULL |
| `TabMembers.jsx:31-37` | アサイン変更は上書きのみ。履歴なし |
| 報酬ロジック | スパキャリ配下に一切なし（`spacareer_invoices` は Stripe の受講生向け請求ミラーで別物） |

本番実データ: 完了49件中29件が「現担当のアサイン日より前」に完了。
第0回を除く算定対象では **19件** が要補正。

## 決定事項（むー様確認済み 2026-07-30）

1. **キックオフ（第0回）は算定対象外**。第1回以降のみ 1回 = 5,000円
2. **応用コースの (1)(2) は 2回分**（各コマ 5,000円）
3. **固定給5万円** = 同時担当3名以上の月に、月額50,000円をセッション報酬と**別枠で加算**
4. 過去分はむー様から正しい担当を教わって一括投入

追加確定（2026-07-30）:

5. 金額はすべて **税込**（営業代行の tier 単価は税別運用なので混同しないこと）
6. 固定給の判定は **月内に1日でも担当していた受講生の実人数**
7. 支払は **翌月末**

## 実装計画

### Phase 1 — DB基盤（帰属を完了時点で確定させる）✅ 適用済 20260730100000

- [x] `spacareer_sessions` に `trainer_id uuid references members(id)` 追加（＝実施時点の担当）
- [x] トリガー `fn_spacareer_stamp_session_trainer`
      `status` が `completed` に変わる瞬間に `spacareer_customers.assigned_trainer_id` を `trainer_id` へコピー。
      同時に `completed_by := spacareer_current_member_id()`（＝実際にボタンを押した人。代理押下の監査用に別カラムで持つ）
      ※ `completed_by` の FK は `members(id)` なので `auth.uid()` ではない
      **フロントではなくトリガーに置く**理由: 完了経路が「完了フロー」「スキップして完了」の複数あるため
- [x] `spacareer_trainer_assignments` テーブル新設
      `(id, org_id, customer_id, trainer_id, started_at, ended_at, assigned_by, created_at)`
- [x] トリガー: `spacareer_customers.assigned_trainer_id` 変更時に前行を `ended_at` で閉じ、新行を開く
- [x] 初期投入: 現在のアサインを `started_at = assigned_at` で1行ずつ
- [ ] 遡及補正: むー様回答をもとに既存19件の `trainer_id` を UPDATE（第0回10件も記録として埋める）

### Phase 2 — 報酬マスタと月次集計 ✅ 適用済 20260730110000

- [x] `spacareer_trainer_rates`
      `(org_id, trainer_id nullable, session_unit_price default 5000, fixed_allowance default 50000,
        fixed_allowance_min_customers default 3, effective_from, effective_to)`
      `trainer_id IS NULL` を全社デフォルト、個別行で上書き
- [x] ビュー `v_spacareer_trainer_monthly`
      月 × トレーナーで
      - `session_count` = 完了 かつ `session_no >= 1` かつ `trainer_id` 一致（part別に1件ずつ）
      - `session_amount` = session_count × 単価
      - `assigned_customer_count` = その月に担当期間が重なる distinct 受講生数（履歴テーブル基準）
      - `fixed_allowance` = 3名以上なら 50,000
      - `total` = session_amount + fixed_allowance

### Phase 3 — 画面

- [x] `SessionRecordsView.jsx` の集計元を `s.trainer_id` に切替（現担当の後付けを廃止）
- [x] `SpacareerSessionsView.jsx` のトレーナー絞り込みも同様
- [x] トレーナー別 月次報酬タブ（回数・単価・固定給・合計）`trainer_rewards` / 権限18名にシード済
- [ ] トレーナー本人が自分の分だけ見られる導線（営業代行の `PayrollSelfDetailView` 相当）
- [ ] 実施トレーナーを後から手修正できる管理UI（誤りの是正用）

### Phase 4 — ワンクリック請求書 ✅ 適用済 20260730120000

営業代行の既存資産を流用する。
- `PayrollInvoiceGenerator.jsx` — 1アクションでPDF生成 → Storage 格納
- `member_invoice_profiles` — 振込先・住所・インボイス番号がDB保存済み（再入力不要）
- `MemberInvoicePDF.jsx` — メンバー個人 → 会社宛の業務委託請求書レイアウト

- [x] スパキャリ版の明細（セッション回数 × 単価、固定給）を渡してPDF生成 `SpacareerInvoiceModal.jsx`
- [x] 生成物の保存先を営業代行と分離
      テーブルは `spacareer_trainer_invoices` に分離（payroll_invoices は
      (org_id,member_id,pay_month) 一意 + maybeSingle() 前提の関数が複数あり、
      同一メンバーが同月に両事業で請求すると壊れるため相乗りしない）。
      Storage は同バケットで `spacareer_YYYY-MM.pdf` とし、既存のバケットRLS
      （path[2]=member_id 判定）をそのまま効かせる。

## 検証

- [ ] 遡及投入後、小山トレーナーの6〜7月実績が正しく復元されているか目視
- [ ] 担当変更を1件テストし、変更前セッションが前任者に残ることを確認
- [ ] 月次集計の合計が手計算と一致するか（3名以上の月／未満の月の両方）

## 進捗（2026-07-30）

- Phase 1 / Phase 2 を本番へ適用済み。ロールバック検証トランザクションで
  「完了時の焼付」「担当変更後も帰属不変」「履歴の閉じ／開き」「変更後は新担当」の4点 OK を確認。
- Phase 3 のうち集計切替と `trainer_rewards` タブを実装。`npm run build` 通過。
- Phase 4（ワンクリック請求書）まで実装・push 済み。
- **残: 19件の帰属投入（むー様の申告待ち）／実施トレーナーの手修正UI**
- 現時点の暫定集計（未確定19件を除く）:
  | 月 | トレーナー | 回数 | 担当人数 | 固定給 | 合計 |
  |---|---|---|---|---|---|
  | 2026-06 | 小山 在人 | 4 | 3 | 50,000 | 70,000 |
  | 2026-07 | 小山 在人 | 7 | 3 | 50,000 | 85,000 |
  | 2026-07 | 林 知佳 | 4 | 4 | 50,000 | 70,000 |
  | 2026-07 | 大渕 将彰 | 1 | 3 | 50,000 | 55,000 |
  | 2026-07 | 鷲尾 凜太郎 | 2 | 1 | 0 | 10,000 |
