# アポ取得報告フォーマット商材別化 ＋ AI添削機能

## 背景・目的

現状、アポ取得報告（AppoReportModal）は全リスト共通の固定17項目テンプレで、Slack投稿本文も `generateReport()` で同一フォーマット生成。
営業代行事業では業務種別・クライアント・リストごとにヒアリング項目が異なるため、画一テンプレでは現場運用に合わなくなってきている。

本機能では以下を実現する：
1. **業務種別ごとにアポ取得報告のフォーマットを切り替え可能にする**（売り手ソーシング/買い手マッチング/クライアント開拓）
2. **同一業務種別内でもクライアント単位・リスト単位でフォーマットの上書きを許可**
3. **録音 → 文字起こし → AI添削をテンプレ駆動で行い、項目を自動補完**

## 概念整理（合意済）

```
当社の事業群
├─ 営業代行事業（Spanaviの主戦場）
│    └─ 商材
│         ├─ M&A（現状唯一）
│         │   ├─ 売り手ソーシング      = engagement: seller_sourcing
│         │   ├─ 買い手マッチング      = engagement: matching
│         │   └─ クライアント開拓      = engagement: client_acquisition（新規追加）
│         ├─ SaaS（将来）
│         ├─ 人材（将来）
│         └─ IFA（将来）
│
└─ 自社別事業（engagementsテーブルに同居するだけ、営業代行とは別）
     ├─ Spartia Career   = engagement: spartia_career
     ├─ Spartia Recruitment = engagement: spartia_recruitment
     ├─ Spanavi          = engagement: spanavi
     └─ Spartia Capital  = engagement: spartia_capital
```

## 確定仕様

### テンプレ継承モデル（3階層）

```
template = call_list.report_template_id                        ← リスト個別カスタマイズ
        ?? client_engagement_template_overrides.template_id    ← クライアント × 業務種別 単位
        ?? engagement.default_report_template_id               ← 業務種別デフォルト（必須）
        ?? error
```

| レベル | 役割 | 必須/任意 |
|---|---|---|
| **業務種別デフォルト** | 売り手ソーシング標準／買い手マッチング標準／クライアント開拓標準 | 必須・全リストの土台 |
| **クライアント × 業務種別 上書き** | A社の売り手リストだけ独自テンプレ | 任意 |
| **リスト個別上書き** | A社のbリストだけさらに別テンプレ | 任意 |

### 商材レイヤー

- `products` テーブルを最初から作成（M&Aだけでも構造を整える）
- engagement → product への紐付け
- 将来SaaS/人材/IFAが増えた時にレイヤー追加せずproductレコード追加だけで対応できる体制

### クライアント開拓 engagement の追加

- 現状 `call_lists.is_prospecting` boolean で表現されているが、業務種別として正式にengagement化
- engagement slug: `client_acquisition`、display name: 「クライアント開拓」
- 既存 is_prospecting=true リストを engagement_id移行
- ただし is_prospecting フラグは「売上集計除外・インターン報酬のみ計上」ロジック互換のため**併存維持**
- UIラベル「新規開拓」→「クライアント開拓」全置換（15ファイル該当）

### フォーマット定義方式

- **完全自由（JSON Schema駆動）**：項目名・型・必須・選択肢をテンプレ側で定義
- ただし既存KPI集計が壊れないよう、固定DBカラム（`sales_amount` / `meeting_date` / `keyman_ma_intent` 等）にマップ可能なフラグを各項目に持たせる
- マップ先がない項目は `appointments.report_data JSONB` に格納

### AI添削フロー

```
[Zoom録音自動取得（既存維持）]
   ↓
[アポモーダルに「文字起こし＋AI添削」ボタン]
   ↓ 押下
 1. Whisperで文字起こし
 2. リスト→クライアント→業務種別 の順でテンプレ解決
 3. JSON Schemaをプロンプトへ動的注入
 4. Claude Haikuが項目別JSON出力
 5. AppoReportModalが各フィールドへ自動投入
   ↓
[メンバー確認・修正]
   ↓
[保存時にbody_templateでレンダリング → appo_report格納 → Slack投稿]
```

### 編集権限

- **テンプレ作成・編集：管理者のみ**
- メンバーはリスト作成時に既存テンプレから選択するだけ

### スコープ外（別途検討）

- クライアントポータル（`ClientPortalApp.jsx`）の商材別画面切替 → 後日決定
- `list_type`（M&A仲介/IFA/ファンド/売り手FA）の扱い → 後日決定（暫定でタグ用途として温存）

---

## フェーズ計画

### Phase 0: 詳細設計確定（実装着手前）

#### 0.A 現状調査結果（2026-05-21 本番DB確認済）

- 全call_lists（アクティブ47件＋アーカイブ約100件）が `engagement = seller_sourcing` に統一されている
- `matching` engagement は archived 状態で実質未使用
- クライアント開拓（is_prospecting=true）は2件のみ（アクティブ）
- **実態としての業務種別は `industry` カラムのテキストパターンで識別されている**
  - 例：株式会社LST「株式会社LST - 買い手マッチング(プラスチック成形)」→ industry に「買い手マッチング」を埋め込み
- list_type（M&A仲介／ファンド／IFA／売り手FA）は「クライアント業種」を表しており業務種別とは別軸

#### 0.B 既存リストの業務種別仕分け（管理画面）

- [ ] 0.B.1 仕分け管理画面の実装（管理者専用）
  - 既存全リスト一覧表示
  - 各リストに「業務種別」セレクタ（売り手ソーシング／買い手マッチング／クライアント開拓）
  - 自動推定で初期値プリセット：
    - `industry` に「買い手」を含む → 買い手マッチング
    - `is_prospecting = true` → クライアント開拓
    - 上記以外 → 売り手ソーシング
- [ ] 0.B.2 むー様が画面で全件確認・確定
- [ ] 0.B.3 確定後、DBに反映（engagement_id を更新、必要に応じて matching engagement を active に戻す）

#### 0.C その他の詳細設計

- [ ] 0.1 商材初期データ確定（暫定：M&Aのみ。SaaS/人材/IFAは将来）
- [ ] 0.2 業務種別マッピング表確定
  - seller_sourcing → M&A
  - matching → M&A
  - client_acquisition（新規）→ M&A
- [ ] 0.3 自社別事業engagement（spartia_career等）の隔離方針確定（product_id = null で営業代行系と分離）
- [ ] 0.4 売り手ソーシング向けテンプレ項目例の洗い出し（売却意向、財務数値、関係者構成 等）
- [ ] 0.5 買い手マッチング向けテンプレ項目例の洗い出し（買収希望業種、予算、シナジー 等）
- [ ] 0.6 クライアント開拓向けテンプレ項目例の洗い出し（依頼可能性、案件規模感、競合状況 等）
- [ ] 0.7 JSON Schema仕様の最終形決定（field type / required / enum / db_column_mapping）
- [ ] 0.8 テンプレ管理画面UIワイヤー検討（フォームビルダ風UI vs 生JSON入力）
- [ ] 0.9 既存17項目のうち「固定カラム必須」と「テンプレで省略可」の切り分け
- [ ] 0.10 クライアント単位上書きUI設置場所の決定（クライアント詳細画面 or リスト作成画面の上位選択）

### Phase 1: DB基盤（マイグレーション）

- [ ] 1.1 `products` テーブル新規作成
  - id, org_id, name, slug, display_order, is_active
  - 初期データ：M&A
- [ ] 1.2 `engagements` に `product_id` (nullable) 追加
  - seller_sourcing, matching に M&A product を紐付け
  - client_acquisition（新規追加） に M&A product を紐付け
  - spartia_career, spartia_recruitment, spanavi, spartia_capital は null（自社別事業）
- [ ] 1.3 `engagements` に `client_acquisition` レコード新規追加（slug, display_name: 「クライアント開拓」）
- [ ] 1.4 既存 call_lists で is_prospecting=true のレコードを engagement_id = client_acquisition.id に移行
- [ ] 1.5 is_prospecting カラムは維持（売上集計除外ロジック互換性のため）
- [ ] 1.6 `appointment_report_templates` テーブル新規作成
  - id, org_id, name, scope_level('engagement'|'client'|'list'), scope_id
  - schema (JSONB), body_template (text), ai_prompt (text)
  - is_active, created_by, created_at, updated_at
- [ ] 1.7 `engagements` に `default_report_template_id` (nullable, FK→appointment_report_templates) 追加
- [ ] 1.8 `client_engagement_template_overrides` 中間テーブル新規作成
  - id, org_id, client_id, engagement_id, report_template_id
  - UNIQUE(org_id, client_id, engagement_id)
- [ ] 1.9 `call_lists` に `report_template_id` (nullable) 追加
- [ ] 1.10 `appointments` に以下を追加
  - `report_template_id_snapshot` (uuid, テンプレ変更後も過去アポを壊さないため)
  - `report_data` (JSONB, カスタム項目の格納先)
- [ ] 1.11 RLSポリシー追加（org_id分離、テンプレ閲覧はメンバー可・編集は管理者のみ）
- [ ] 1.12 全migration冒頭に `set local search_path = public, extensions;` を入れる
- [ ] 1.13 本番適用は低トラフィック時間帯に実施

### Phase 2: 商材マスタ管理画面

- [ ] 2.1 管理者専用ルーティング `/admin/products` 追加
- [ ] 2.2 商材一覧画面（DataTable使用、商材名・slug・有効状態・display_order）
- [ ] 2.3 商材新規追加モーダル / 編集モーダル
- [ ] 2.4 商材＋engagement紐付け管理画面（engagementを商材に紐付ける一覧）
- [ ] 2.5 SidebarShell管理者メニューに導線追加

### Phase 3: アポ報告テンプレ管理画面

- [ ] 3.1 管理者専用ルーティング `/admin/report-templates` 追加
- [ ] 3.2 テンプレ一覧画面（商材→業務種別→クライアント→リスト の階層グループ表示）
- [ ] 3.3 テンプレ編集画面：基本情報セクション（name / scope_level / scope_id）
- [ ] 3.4 テンプレ編集画面：JSON Schema編集UI（フォームビルダ風）
  - 項目追加・削除・並べ替え（drag&drop）
  - 各項目に label / key / type (text/textarea/number/date/select/boolean) / required / placeholder / db_column_mapping を設定
- [ ] 3.5 テンプレ編集画面：body_template編集（{{key}}差し込み記法、プレビュー付）
- [ ] 3.6 テンプレ編集画面：ai_prompt編集（system promptに追記される指示文）
- [ ] 3.7 プレビュー機能（モックデータで実際のアポモーダル見た目を表示）
- [ ] 3.8 既存17項目を網羅したサンプルテンプレを「売り手ソーシング・標準」として初期投入
- [ ] 3.9 engagement画面で「このengagementのデフォルトテンプレ」を選択するUI

### Phase 4: クライアント単位 ＆ リスト単位 上書き設定

- [ ] 4.1 クライアント詳細画面に「業務種別ごとのテンプレ上書き」セクション追加
  - そのクライアントが関わる engagement一覧を表示
  - 各engagementに「デフォルト継承 / 上書きテンプレ選択」のセレクタ
- [ ] 4.2 `ListView.jsx` のリスト作成/編集フォーム拡張
  - テンプレ選択UI追加（「クライアント・業務種別の継承 / 上書きテンプレ選択」）
  - 継承候補を「業務種別デフォルト：売り手標準」「クライアント上書き：A社特殊」のように表示
- [ ] 4.3 既存リスト編集画面でも同様に追加（後方互換）

### Phase 5: AppoReportModalの動的レンダリング

- [ ] 5.1 モーダル起動時に call_list → client × engagement → engagement の順でテンプレ解決
- [ ] 5.2 テンプレSchema駆動でフィールド動的生成
- [ ] 5.3 既存固定カラム項目（売上・面談日 等）は引き続きDB固定カラムへ格納
- [ ] 5.4 カスタム項目は `report_data` JSONBへ格納
- [ ] 5.5 バリデーション動的化（required / 型チェック / enum）
- [ ] 5.6 既存ロジック `generateReport()` をbody_template駆動に置換
- [ ] 5.7 後方互換：テンプレなしリストでは従来通り固定17項目で動作

### Phase 6: AI添削ボタン（テンプレ駆動）

- [ ] 6.1 `supabase/functions/transcribe-recording/index.ts` 拡張
  - 入力：appointment_id（テンプレ解決のため）+ 録音URL
  - リストのテンプレSchemaを取得しプロンプトに動的注入
  - 出力：JSON Schemaに沿ったJSON
- [ ] 6.2 「文字起こし＋AI添削」ボタンをAppoReportModalに配置（Zoom録音URL取得済み時のみ活性）
- [ ] 6.3 既存固定4項目（personality/meetingExp/futureConsider/other）抽出ロジックも統一プロンプトに統合
- [ ] 6.4 AI出力後はメンバー目視確認できる中間ステップを必ず置く（自動保存しない）
- [ ] 6.5 Edge Function deploy → 1件本番検証（feedback_edge_function_deploy_check準拠）
- [ ] 6.6 既存 `appo-ai-report` Edge Function は重複機能になるため整理 or 廃止判断

### Phase 7: Slack投稿テンプレ駆動化

- [ ] 7.1 `post-appo-to-slack` でbody_templateベースの本文組み立てに変更
- [ ] 7.2 後方互換：テンプレなしリストでは従来 `appo_report` をそのまま使用
- [ ] 7.3 業務種別別Slackチャネル振分け検討（オプション、clients.slack_webhook_urlで既に分離可なので低優先）

### Phase 8: UIラベル全置換「新規開拓」→「クライアント開拓」

- [ ] 8.1 該当ファイル15件のラベル文字列を一斉置換
  - ListView.jsx, AppoListView.jsx, SourcingDashboardView.jsx, StatsView.jsx, PayrollView.jsx, AppoReportModal.jsx, useSpanaviData.jsx, PayrollSelfDetailView.jsx, KPIScorecard.jsx, Funnel.jsx, CRMLead系 など
- [ ] 8.2 ユーザーから明示的に指摘された画面要素（2026-05-21 スクショ確認済）
  - 架電リスト画面：displayFilterタブ「新規開拓」ボタン → 「クライアント開拓」
  - 架電リスト画面：リスト行左のクリーム色バッジ「新規開拓」 → 「クライアント開拓」
  - アポリスト画面：リスト名右のクリーム色バッジ「新規開拓」 → 「クライアント開拓」
- [ ] 8.3 ソーシングメイン業務 vs クライアント開拓 の表示切替ロジックもengagement判定に寄せていく（将来）
- [ ] 8.4 置換漏れ確認：`grep -r "新規開拓" src/` で 0件になるまでチェック

### Phase 9: 影響確認 ＆ 残KPI対応

- [ ] 9.1 既存集計画面（AnalyticsView / PerformanceView / ClientReport / 給与）への影響確認
- [ ] 9.2 `report_data` JSONBに格納された項目を将来集計画面で使えるよう、JSONB index設計検討（後回し可）
- [ ] 9.3 クライアントポータルの架電結果表示への影響確認（表示内容変わるか）

### Phase 10: ドキュメント

- [ ] 10.1 管理者向け「商材・業務種別・テンプレ作成手順」ドキュメント
- [ ] 10.2 メンバー向け「AI添削ボタンの使い方」ヘルプ追記
- [ ] 10.3 SPANAVI_OVERVIEW.md にデータモデル変更を追記

---

## リスク・注意事項

| リスク | 対策 |
|---|---|
| 既存`appo_report`本番運用中 | 移行期間は新旧併存。テンプレ未設定リストは旧フローのまま動作 |
| RLSポリシー大規模変更 | 低トラフィック時間帯に実施（memory: feedback_rls_changes） |
| Edge Function I/F変更後の本番未deploy事故 | mainマージ後必ず `supabase functions deploy` + 1件検証（memory: feedback_edge_function_deploy_check） |
| 自由項目で既存KPI集計が壊れる | 固定カラムマップを必須フラグ化、新規カスタム項目は集計対象外と明示 |
| テンプレ変更で過去アポの表示が崩れる | `report_template_id_snapshot` で保存時テンプレを凍結 |
| Zoom録音取得タイミングと添削ボタンの整合 | 録音未取得時はボタンを非活性化し「録音取得待ち」表示 |
| 3つの架電画面で挙動差分発生 | CallingScreen / CallFlowView / CompanySearchView すべてで同じモーダルを使うので、AppoReportModalの単一改修で全画面反映（memory: feedback_3screens_share_call_records） |
| is_prospecting と engagement = client_acquisition の二重定義 | engagement移行後は is_prospecting を「engagement由来で派生算出」する方向に寄せる（Phase 8.2） |
| 「新規開拓」表記置換漏れ | 15ファイル一斉置換 + Grepで残存確認 |

## 関連ファイル（主要）

- `src/components/views/AppoReportModal.jsx` — メインフォーム（Phase 5）
- `src/components/views/ListView.jsx` — リスト作成画面（Phase 4）
- `src/lib/supabaseWrite.js` — insertAppointment / insertCallList（Phase 1配線）
- `supabase/functions/transcribe-recording/index.ts` — AI抽出（Phase 6）
- `supabase/functions/post-appo-to-slack/index.ts` — Slack投稿（Phase 7）
- `supabase/functions/appo-ai-report/index.ts` — Phase 6で整理対象
- `supabase/migrations/20260518000001_add_is_prospecting_to_call_lists.sql` — is_prospecting経緯参考
- `src/components/client/ClientPortalApp.jsx` — 影響確認のみ（Phase 9）

## Review

（実装完了後に記入）
