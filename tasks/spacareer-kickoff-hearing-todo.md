# スパキャリ「第1回前 70問キックオフヒアリング」実装todo

> 参照仕様書：`tasks/spacareer-spec.md` §6.2A / §8.7 / §9.1 / §10.1 / §11
> 共通目標：**運営の人的コストを限りなくゼロに近づける**（配信・リマインダー・AI抽出・ダイジェスト配信を全自動化）
> 原典：第1回セッション 事前ヒアリングシート（全70問・むー様作成）

---

## 設計の根本方針（壁打ち確定事項）

| 論点 | 確定 |
|---|---|
| 70問の位置づけ | **第1回前のみ起動する固定ヒアリング**。第2〜8回前のAI 30問とは別物・別画面・別テーブル |
| 入力UI | **スパキャリポータル統合**（Google Forms 不採用） |
| AI任せの範囲 | **重要発言ハイライトTop5抽出** ＋ **深掘り候補3つ提案** の2つだけ |
| AI化しない範囲 | 02スライド一文抽出／PPT自動生成／打ち手仮説立案（代表が責任を持つ領域） |
| 60-90分フィルター | **途中保存可＋72h期限**で両立。途中離脱はリマインダーで救済 |
| センシティブ項目（G健康・I家族） | **任意フラグ**（未回答でも提出可） |

---

## Phase A：DB スキーマ定義

- [ ] A1. `spacareer_kickoff_hearing_questions` テーブル（70問マスタ）
  - カラム：`id`, `section_code`(A〜J)、`section_name`、`question_number`(1〜70)、`question_text`、`answer_type`(short/long/radio/checkbox)、`is_required`、`char_limit`、`placeholder`、`help_text`、`display_order`、`is_active`、`created_at`、`updated_at`
- [ ] A2. `spacareer_kickoff_hearing_responses` テーブル（顧客×質問×回答）
  - カラム：`id`, `client_id`、`question_id`、`answer_text`、`answer_json`(任意・配列回答用)、`is_draft`、`updated_at`
  - インデックス：`(client_id, question_id) unique`
- [ ] A3. `spacareer_kickoff_hearing_sessions` テーブル（受講生1人=1セッション、進捗管理）
  - カラム：`id`, `client_id`(unique)、`status`(未通知/未着手/入力中/提出済み/AI抽出済み/完了)、`first_accessed_at`、`deadline_at`(初回アクセス+72h)、`submitted_at`、`ai_extracted_at`、`completed_at`、`deadline_extended_to`(運営手動延長)、`created_at`
- [ ] A4. `spacareer_kickoff_hearing_ai_extractions` テーブル（AI抽出結果）
  - カラム：`id`, `client_id`、`extraction_type`(highlight_top5/deep_dive_3)、`content_json`、`source_response_ids`(jsonb配列)、`model`、`prompt_version`、`created_at`
- [ ] A5. RLS ポリシー：admin/trainer は全顧客閲覧可、student は自分の `client_id` のみ
- [ ] A6. DB trigger：顧客登録（`spacareer_clients` INSERT）→ `spacareer_kickoff_hearing_sessions` 自動作成（status=未通知）
- [ ] A7. DB trigger：受講生が初回アクセス → `first_accessed_at` 自動セット＋`deadline_at` 計算
- [ ] A8. DB trigger：提出完了 → pg_net で Edge Function `analyze-kickoff-hearing` 呼び出し
- [ ] A9. `set local search_path = public, extensions;` を必ず冒頭に（feedback_supabase_migration_search_path）

## Phase B：テンプレマスタ seed 投入

- [ ] B1. 70問データを `spacareer_kickoff_hearing_questions` に seed 投入
  - 原典：本ドキュメントの直下「70問原典」参照（むー様作成）
  - セクションA基本情報9問／B経済10問／C時間・環境8問／D動機・価値観10問／E過去経験7問／F現在のスキル7問／G健康・メンタル6問／H未来像5問／I家族4問／Jコミュ3問＋ボーナス3問
- [ ] B2. 必須/任意フラグ：G・I は全項目任意、他は全項目必須（壁打ち確定通り）
- [ ] B3. 文字数目安・記入例（placeholder）の確定 → むー様確認

## Phase C：受講生UI（クライアントポータル）

- [ ] C1. ルート追加：`/spacareer/kickoff-hearing`（既存「事前課題」とは別画面）
- [ ] C2. 左サイドバーに「キックオフヒアリング」項目を追加（第1回完了まで表示、完了後は非表示）
- [ ] C3. セクションA〜J 縦並びレイアウト＋セクション折りたたみUI
- [ ] C4. 上部固定バー：72hカウントダウン＋必須項目進捗バー
- [ ] C5. 右カラム：セクション一覧＋必須未回答数（クリックでジャンプ）
- [ ] C6. 一時保存ボタン＋セクション移動時の自動保存
- [ ] C7. 任意/必須バッジ（G/I は「任意」明示）
- [ ] C8. 提出ゲート：必須項目未回答時は提出ボタン無効＋未回答箇所へジャンプCTA
- [ ] C9. 提出後のサンクス画面（「キックオフでお会いしましょう」）
- [ ] C10. 既存DataTable/Card/Buttonトークンで統一（CLAUDE.md UI開発ルール準拠、絵文字禁止）

## Phase D：運営UI

- [ ] D1. 顧客個人ページの中央タブに「キックオフヒアリング」タブを追加（既存8タブの先頭、第1回前のみ表示）
- [ ] D2. タブ内構成：
  - 上部KPI：ステータス／進捗率／提出までの残時間
  - 中央セクション1：**AI抽出結果**（ハイライトTop5＋深掘り候補3つ）
  - 中央セクション2：**原文回答**（セクションA〜J、折りたたみ）
- [ ] D3. CSVエクスポート機能（70問全回答）
- [ ] D4. 期限手動延長ボタン（権限：admin のみ）
- [ ] D5. AI抽出再実行ボタン（プロンプト改善時用、admin のみ）

## Phase E：AI抽出 Edge Function

- [ ] E1. `supabase/functions/analyze-kickoff-hearing/index.ts` 新規作成
- [ ] E2. 入力：`client_id` → 70問回答取得 → Claude Haiku 4.5 で2プロンプト並列実行
- [ ] E3. プロンプト1：重要発言ハイライトTop5抽出（出力JSON：`[{question_id, excerpt, why_important}]` × 5）
- [ ] E4. プロンプト2：深掘り候補3つ提案（出力JSON：`[{topic, rationale, suggested_question}]` × 3）
- [ ] E5. 結果を `spacareer_kickoff_hearing_ai_extractions` に保存
- [ ] E6. 末尾で Slack 通知 → **DB trigger + pg_net パターンで分離**（feedback_edge_function_bg_task 準拠：末尾fetch打ち切られ事故回避）
- [ ] E7. Authorization + apikey 両方を pg_net 呼び出しに付与（feedback_pgcron_jwt_debug 準拠）
- [ ] E8. `supabase functions deploy` で本番反映＋1件検証（feedback_edge_function_deploy_check 準拠）

## Phase F：Slack 自動配信

- [ ] F1. 顧客登録完了 trigger → ゲストチャンネルに「キックオフヒアリング配信」DM（既存 `spacareer-slack-notify` 流用）
- [ ] F2. pg_cron（毎時実行）→ 72h期限24h前で未提出/入力中の顧客にリマインダー
- [ ] F3. AI抽出完了 trigger → 運営Slackチャンネルへ「ハイライト+深掘り候補+原文リンク」ダイジェスト配信
- [ ] F4. キックオフ前日朝（pg_cron 9:00）→ 運営Slackへ最終確認通知（当該顧客のヒアリング状況サマリ）
- [ ] F5. テンプレ文面を `spacareer_template_master` の通知テンプレに追加（運営編集可）

## Phase G：テンプレマスタ管理画面統合

- [ ] G1. 既存「テンプレート管理」画面に「キックオフヒアリング70問」タブ追加
- [ ] G2. 質問の追加/編集/並び替え/削除（admin のみ）
- [ ] G3. セクション単位の必須/任意切替（admin のみ）
- [ ] G4. プレビュー機能：受講生視点で表示確認
- [ ] G5. 変更履歴（既存仕様 §7.6 準拠）
- [ ] G6. **テンプレ変更影響範囲ルール**（既存仕様準拠）：配信済み顧客は旧版固定、未配信＋新規は新版適用

## Phase H：検証・本番反映

- [ ] H1. ローカルで migration 適用、`npm run build` 通過確認
- [ ] H2. テスト顧客1名で全フロー通し（登録→Slack DM→受講生入力→提出→AI抽出→運営ダイジェスト）
- [ ] H3. 72h期限切れ動作・延長動作の確認
- [ ] H4. センシティブ項目（G/I）未回答提出の確認
- [ ] H5. **本番Supabase反映は低トラフィック時に**（feedback_rls_changes 準拠）
- [ ] H6. Vercel 自動デプロイ後、本番で同じテスト顧客フローを再実行
- [ ] H7. 本仕様書 §11 残ペンディング #11/#12 を消し込み

---

## 70問原典（むー様作成・Phase B seed投入用）

> 以下はそのままB1のseedに転記。設問番号は固定、文面の微修正があれば適宜マスタで運営編集。

### A. 基本情報（必須）
1. お名前（漢字フルネーム）
2. お名前（ふりがな）
3. 呼ばれたい呼称（さん/くん/ちゃん/ニックネーム）
4. 生年月日
5. 性別（任意）
6. 現居住地（都道府県・市区町村）
7. 出身地
8. 緊急連絡先（電話番号）
9. 普段のメイン連絡手段（LINE/メール/Slack/その他）

### B. 経済状況（必須）
10. 現在の職業/会社名/役職
11. 業界・職種
12. 勤続年数
13. 現在の年収（税込・賞与込）
14. 月の手取り収入
15. 現在の貯蓄額（おおよそ）
16. 月の固定費（住居費・通信費・サブスク等の合計）
17. 月の可処分所得（目安）
18. ローン・借入金の有無と金額
19. スパキャリ受講後、毎月自由に使える自己投資・追加学習費の上限
20. 副業や別収入源があれば内容と金額

### C. 時間・環境（必須）
21. 平日の起床時間／就寝時間
22. 平日に「自由に使える時間」（平均/日）
23. 休日に「自由に使える時間」（平均/日）
24. スパキャリのために確保できる週あたりの時間（自己宣言）
25. 自宅に集中できる作業環境はあるか（机・椅子・モニター・ドアの有無）
26. 使用PCのスペック・OS
27. 通信環境（光回線/モバイル/速度）
28. 家族と同居の場合、声を出してセッションできる時間帯

### D. 動機・価値観の深掘り（必須・記述式長文歓迎）
29. なぜ「今」スパキャリに参加することを決めたのか
30. 決めた瞬間/きっかけは何だったか（具体的な日・場面）
31. もし今回参加していなかったら、半年後どうなっていると思うか
32. 親しい人に「なぜ98万円も払うの？」と聞かれたら、何と答えるか
33. 今回のスパキャリで「絶対に手に入れたい」ものを3つ
34. お金以外で本当に大切にしているもの（価値観）を3つ
35. 尊敬している人物（実在/著名人）とその理由
36. 「死ぬまでに絶対やりたいこと」を3つ
37. 「絶対に失いたくないもの」を3つ
38. 自分が一番ご機嫌でいられる瞬間はどんなとき

### E. 過去の経験（必須）
39. これまでに自己投資した総額（おおよそ）と主な内訳
40. 過去最大の挫折経験と、そこから何を学んだか
41. 過去最大の成功体験
42. これまでで最も「自分は伸びた」と感じた環境/期間とその要因
43. 自分が継続できなかった行動・習慣の例（3つ以上）
44. 自分が継続できた行動・習慣の例（3つ以上）
45. 過去にスクール・コーチングを受けた経験の有無、結果

### F. 現在のスキル（必須）
46. AI/生成AIの利用歴・業務活用度（0〜10段階+具体例）
47. 営業経験（BtoB/BtoC/商材/トップ営業経験等）
48. フリーランス・副業経験（期間・売上規模）
49. SNS運用経験（プラットフォーム・フォロワー数・運用目的）
50. ライティング経験（媒体・本数）
51. ポートフォリオ・実績物の有無（あればURL）
52. 保有資格

### G. 健康・メンタル（**任意**・未回答提出可）
53. 現在の健康状態（良好/不調があれば内容）
54. 平均睡眠時間
55. 運動習慣（週何回・内容）
56. 食生活の自己評価（1〜10）
57. 現在のメンタル状態（1〜10）
58. 重大なストレス要因が現在ある場合は内容

### H. 未来像（必須・記述式）
59. 5年後、どうなっていたいか（自由記述、できるだけ具体的に・固有名詞で）
60. それが達成できたら、誰の顔が一番に浮かぶか
61. もし達成できなかった場合、5年後の自分はどう感じていると想像するか
62. ゴールが達成できた瞬間の場面を、五感で描写（視覚/聴覚/触覚/感情）
63. 達成までの最大の障害は何だと自覚しているか

### I. 家族・パートナー（**任意**・未回答提出可）
64. 家族構成（同居・別居）
65. パートナー/家族のスパキャリ参加への理解度（1〜10）
66. 家族・パートナーに「公言」できているか（できていなければ理由）
67. 家族との時間の確保で考慮すべきこと

### J. コミュニケーション希望（必須）
68. 厳しいフィードバックへの耐性（1〜10）
69. ほめられる/詰められる、どちらの方がパフォーマンス出るか
70. 連絡頻度の希望（毎日/週数回/週1回）+ NG時間帯

### ボーナス質問（任意）
- B1. 第1回で「これだけは聞きたい」ことを自由に
- B2. 第1回終了時、自分がどんな状態になっていたいか（理想を一言で）
- B3. 代表/担当への意気込みを、文字数制限なしで自由に

---

## 完了条件

- 顧客登録から第1回キックオフまで、運営は「Slackで届く抽出ダイジェストを5分眺める」「必要なら期限を延長する」以外の作業が発生しない
- AI抽出の精度がコーチング判断に使える水準（むー様判定）
- センシティブ項目を任意で残しつつ、提出率が下がらない（運用1ヶ月後にレビュー）

## Review

### 2026-05-25 Phase A〜G + F一部 + 受講生フロー検証手前まで完了

**完了したこと**:
- Phase A/B: DB 4テーブル+RLS+trigger+73問seed → 本番Supabase反映済
- Phase C: ClientKickoffHearingView.jsx (セクション折りたたみ・autosave・72hカウントダウン)
- Phase D: TabKickoffHearing.jsx (KPI/AI抽出/原文/CSV/期限延長/再抽出/配信ボタン)
- Phase E: analyze-kickoff-hearing Edge Function (Claude Haiku 4.5並列, v3 deploy済)
- Phase F: kickoff-hearing-reminder Edge Function (pg_cron毎時5分実行)
  - spacareer-slack-notify 拡張 (notify_key 2種追加 + ASCII placeholder)
  - 通知テンプレ3種 seed
- Phase G: KickoffHearingTemplateEditor.jsx (テンプレ管理画面に「キックオフ70問」カテゴリ追加)
- **受講生専用ログイン /spacareer/login を新設** (commit `6a0b341`、営業代行クライアントと同じ分離設計)

**設計の重要変更（壁打ちで確定）**:
- 提出期限: 72h相対 → 第1回セッション3日前 23:59 絶対期限
- Slack配信: 顧客フルネームチャンネルのみ (運営チャンネル構想は廃案)
- placeholder: 日本語キー → ASCII (`{customer_name}` `{hearing_url}` `{deadline}`)

**直近で潰したバグ**:
- `members.phone` 列なし問題 → useCustomerDetail から削除
- student の Navigate 無限ループ → 既に /spacareer 配下なら Navigate しない
- ヒアリング保存ボタン無反応 → 上記2つの副次的な事象（customer.data=null）として解消

**残ペンディング（次回ここから）**:
- 受講生として小山さんで /spacareer/login ログイン → 70問入力→提出→AI抽出→運営画面確認 ★最初にこれ
- 24h前リマインダー pg_cron 動作確認 (deadline_at 操作で即発火可能)
- テスト終了後: 小山さんの rank/role を 'スパルタン' に戻す
- テスト顧客クリーンアップ判断

**テスト顧客状態**:
- spacareer_customers.id: `815f5d27-a98d-40be-bab7-8110afcc79d4`
- session.status: 'unstarted' (or 'in_progress')、deadline_at='2026-05-29 14:59 UTC'
- responses: 59必須 dummy 回答 (is_draft=true)
- Slack channel C0B5W0R0KN2 紐付け済
