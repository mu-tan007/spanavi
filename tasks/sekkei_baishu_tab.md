# 設計：買収タブ（acq_*）

2026-10-06。論点＝弊社が買い手として受けた売却案件・仲介会社・担当者・書類・やり取りの持ち方。既存の Spartia Capital（cap_*、0件、RLS は authenticated 全許可）は使わない（むー様決定）。

## 実データで分かったこと

| 項目 | 実測 |
|---|---|
| 管理者 | users.role='admin' は1人（org a0000000-…-0001）。`is_org_admin()` は users.role を見る |
| 全社タブの権限の壁 | `is_org_admin() AND org_id = get_user_org_id()`（corporate_finance_monthly・site_metrics_daily） |
| 法人番号の持ち場所 | company_master には**列が無い**。company_profiles（約51万行）・call_list_items に corporate_number |
| 既存の保管場所 | 非公開バケット多数。IM用に流用できる専用のものは無い |
| 初期データ | 1対1の紹介 38社＋配信候補 6件・紹介元 16社前後・担当者 30人前後・やり取り数百件 |
| 仲介会社と営業代行の顧客 | アイコン・ユニヴィス・リンクタイズ・NEWOLD 等は clients にもいる（役割は別） |

## 決めたこと

- 表は新規の `acq_` 接頭辞で独立させる。cap_* と clients/client_contacts は使わない。
- 主キーは全表 uuid。全表に `org_id NOT NULL`。作り直しが要る表は0（全部新規）。
- 権限の壁は全表・全操作 `is_org_admin() AND org_id = get_user_org_id()`（全社タブと同じ）。
- 仲介会社＝`acq_firms`（種別：仲介／買い手側FA／売り手側FA／マッチングサイト／公的機関／その他）。営業代行の顧客と同じ会社は `client_id`（clients への任意の参照）で結ぶだけにする。
- 担当者＝`acq_contacts`（firm_id、氏名・役職・メール・電話・連絡手段・LINE名・メモ）。
- 案件＝`acq_deals`。実名 `name`（空でよい）と PJ名・匿名見出し `project_name` を両方持ち、表示は実名優先。
- 紹介元は `source_firm_id`・`source_contact_id`、売り手側FAは `sell_side_firm_id`。入口は `channel`（intro／broadcast／self／platform／public）。
- 配信候補は案件表に同居させ、段階 `candidate` で持つ（昇格は段階を進めるだけで複写しない）。一覧の既定では隠す。
- 段階の正は `acq_deal_stage_events`（stage・日付・メモ）。現在の段階は最新行から導く（ビュー）。
- 段階：candidate／received／nda／im_received／qa／top_meeting／loi_submitted／basic_agreement／dd／definitive_agreement／closed_won、終了＝declined_by_us／lost／name_clear_denied。
- 希望価格は `asking_price_min`・`asking_price_max`（円、点なら同値）＋ `asking_price_basis`（equity／enterprise／unknown）＋原文 `asking_price_text`。
- 財務は `acq_deal_financials` に期ごとの行で持ち、`source`（im／ours）で IM値と弊社修正値を分ける。一意は (deal_id, period_label, source)。
- 一覧の売上・EBITDA・ネットキャッシュは、最新期の ours があれば ours、無ければ im をビューで出す。マルチプル＝希望価格の中央値÷その EBITDA。
- 書類＝`acq_documents`（doc_type：nonname／im／qa／financials／loi／top_meeting／contract／other、`series` で同じ書類の版をまとめ `version_no`、`direction` received／sent、受領日、元ファイル名、鍵）。
- QA は当面ファイルとして書類に入れ、弊社質問版＝sent・先方回答版＝received を同じ series の続き版で残す。行ごとのQA表は作らない。
- 保管は新しい非公開バケット `acq-docs`、鍵は `{org_id}/{deal_id}/{uuid}.{ext}`（ASCIIのみ）。storage の RLS も管理者のみ。
- やり取り＝`acq_activities`（日時・手段・向き・相手 contact_id・firm_id・要約・原文リンク・`source_kind`＋`source_ref`）。再取込で重複しないよう (org_id, source_kind, source_ref) を一意にする。
- やり取りと案件は多対多の `acq_activity_deals`（1通で2案件の紹介がある）。担当者は1件に1人（主な相手）。
- 会社との照合の鍵は法人番号 `corporate_number`（13桁）＋任意の `company_profile_id`。company_master には法人番号が無いので結ばない。
- スコープ用に `scope_domain`（防衛関連14領域）と `defense_relation`（◎／○／無し）を案件に持つ。

## やらないこと

- 財務の評価・LBO・DD チェックリスト・自社ソーシングの表は今は作らない（画面の土台ができてから）。
- QAの行単位管理、メール・LINE の自動取込は作らない（初期データは一括で入れる）。
- cap_* の削除や権限修正は今回触らない（別件として報告）。

## 答え合わせ

- 一覧に 38社＋候補6件が出て、表示名・希望価格・マルチプルが空欄だらけでないこと。
- 非管理者アカウントで acq_* と acq-docs が0件・読めないこと（SQLで anon/caller ロールを想定して確認）。
- 仲介会社画面の紹介件数の合計＝案件数（候補除く）。

## 実装の順番

1. マイグレーション（表・ビュー・RLS・バケット）
2. 仮想 engagement `acquisition`（全社と同じ作り）＋サイドバー＋タブ配列への追加
3. 画面：案件一覧 → 案件詳細（概要・書類・やり取り・財務）→ 仲介会社 → 担当者
4. 初期データ投入（案件・会社・担当者 → 書類 → やり取り）
5. 画面で確認 → main へ出す → 本番で確認

## むー様に決めてもらうこと

なし（進めてよいと承認済み）。
