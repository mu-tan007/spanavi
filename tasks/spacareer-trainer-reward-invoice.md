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
- [x] 遡及補正: むー様回答をもとに既存19件の `trainer_id` を UPDATE 済（2026-07-31）
      小山15件（佐藤広和1 / 福原1 / 野々垣1-3 / 佐藤新1-4 / 岡田1-3 / 間森3 / 酒井1-2）
      鷲尾4件（間森1-2 / 米澤1-2）。米澤第3回は既に林で登録済みでむー様指定と一致、変更なし。
      第0回11件は算定対象外のため未設定のまま

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

## 未解決の論点（2026-07-31）

**固定給5万の判定が「アサイン履歴」基準のため、鷲尾トレーナーが漏れる。**

`v_spacareer_trainer_monthly.assigned_customer_count` は `spacareer_trainer_assignments`
（＝現アサインからのシード）を見ている。鷲尾は7月に米澤・間森・朝海の**3名に実施**して
いるが、履歴上は朝海1名しか担当していないことになっており固定給が 0 になる。
遡及19件と同じ根本原因（過去の担当期間が履歴に無い）。

選択肢:
- (A) 固定給の判定を「その月に実際に実施した distinct 受講生数」に変える → 鷲尾に5万が付く
- (B) 履歴テーブルに鷲尾の過去担当期間を遡って投入する（開始/終了日をむー様に確認）
- (C) 現状のまま（鷲尾は固定給なし）

併せて 大渕は 7/24 アサインの3名を保持しているだけで実施1回だが、ルール
「月内に1日でも担当していれば人数に数える」に従い固定給5万が付いている。

## 進捗（2026-07-30）

- Phase 1 / Phase 2 を本番へ適用済み。ロールバック検証トランザクションで
  「完了時の焼付」「担当変更後も帰属不変」「履歴の閉じ／開き」「変更後は新担当」の4点 OK を確認。
- Phase 3 のうち集計切替と `trainer_rewards` タブを実装。`npm run build` 通過。
- Phase 4（ワンクリック請求書）まで実装・push 済み。
- **残: 実施トレーナーの手修正UI／固定給5万の判定基準（上記の未解決論点）**

## 2026-08-03 の変更（むー様指示）

### 1. 各回の実施トレーナーを画面から指定できるようにした
セッション管理タブの先頭に「実施トレーナー」カードを追加。既定は専属担当、代打の回だけ
差し替える。選んだ瞬間に `spacareer_sessions.trainer_id` へ保存する。
完了前に指定しておけば完了時のトリガーは上書きしない（トリガーは trainer_id が NULL の
ときだけ焼き付ける作りなのでそのまま活きる）。完了後の変更も可能＝帰属の訂正UIも兼ねる。
専属担当（`spacareer_customers.assigned_trainer_id`）は変わらないので、代打しても
固定給の担当人数には影響しない。

### 2. 固定給5万の判定を「月末時点の担当人数」に変更
旧: 月内に1日でも担当していれば数える → 3人→2人でも5万が付いていた。
新: 月末時点（進行中の月は現時点）で担当している人数で判定。
月内で下回った月は付かず、増えた月は付く（むー様確定 2026-08-03）。
→ 前記「未解決の論点」の鷲尾の件は、この変更では解消しない（履歴に過去の担当期間が
無いという別の問題のため）。

### 3. 卒業・解約で担当期間を閉じる
`fn_spacareer_track_trainer_assignment` を status 変更でも発火するようにし、
`graduated` / `cancelled` になったら開いている担当期間を閉じる。
`assigned_trainer_id` は残す（誰が担当していたかは画面に出す）。受講中に戻したら
その時点から新しい担当期間を開く（assigned_at 起点だと過去月の人数が動くため）。
併せて、そもそも卒業・解約に落とす導線が画面に無かったので、メンバータブに
「受講ステータス（運営のみ）」を追加した。

migration: 20260803110000。ロールバック検証で「卒業で閉じる」「受講中に戻すと開き直す」
「完了前に指定した実施トレーナーが完了時に上書きされない」の3点を確認済み。

## 報酬対象外トレーナー（2026-08-03）

むー様指示で **小山（事業責任者）は報酬一覧に出さない**。
`spacareer_trainer_rates.reward_eligible` を追加し、小山の個別行を `false` で投入。
`v_spacareer_trainer_monthly` は `reward_eligible` が true の行だけ返す（migration 20260803100000）。
ビューに名前を直書きしていないので、対象者が変わったらこのテーブルの1行で切り替えられる。
セッション記録タブの実績集計は従来どおり小山の分も出る。

## 遡及投入後の集計（2026-07-31）

| 月 | トレーナー | 回数 | 履歴上の担当人数 | 実際に実施した人数 | 固定給 | 合計 |
|---|---|---|---|---|---|---|
| 2026-06 | 小山 在人 | 9 | 3 | 6 | 50,000 | 95,000 |
| 2026-07 | 小山 在人 | 17 | 3 | 7 | 50,000 | 135,000 |
| 2026-07 | 林 知佳 | 4 | 4 | 3 | 50,000 | 70,000 |
| 2026-07 | 大渕 将彰 | 1 | 3 | 1 | 50,000 | 55,000 |
| 2026-07 | 鷲尾 凜太郎 | 6 | 1 | 3 | 0 | 30,000 |
