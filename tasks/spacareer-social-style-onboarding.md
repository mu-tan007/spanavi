# スパキャリ 受講生招待 + ソーシャルスタイル診断 オンボーディング刷新

## 背景
既存の「先に診断トークン → 完了後に顧客発行」フローを、Spanavi メンバー招待と同型の「先に氏名+メールで招待 → ログイン後に診断強制」フローに転換する。
クライアントポータル側に診断UIを新規追加し、診断結果を管理画面の顧客一覧/詳細に反映してトレーナー運用に直結させる。

## 合意済み仕様
1. **フロー**: 受講生招待（氏名+メアド）→ Resend経由で招待メール → ログイン後にソーシャルスタイル診断を強制リダイレクト → 完了後に通常メニュー解禁
2. **メール送信元**: `noreply@spanavi.jp`（既存Resend設定流用）。差出人名は「スパキャリ事務局」
3. **未受講者案内**: キックオフヒアリング同様、診断未完了の間は全タブ強制リダイレクト
4. **30問**: 現状の `socialStyleQuestions.js` を維持。タイプ別「トレーナーの接し方指針」を **詳細記述版** に拡充

## 既存資産（流用）
- `src/components/spacareer/admin/social-style/socialStyleQuestions.js` … 30問 + 4タイプ説明（`coach_tips`は箇条書きのみ→詳細化）
- `src/components/spacareer/admin/social-style/SpacareerSocialStyleView.jsx` … 招待一覧 + KPI（一部刷新）
- `src/components/spacareer/admin/social-style/DiagnosisInviteModal.jsx` … 招待モーダル（拡張：氏名追加 + メール送信化）
- `supabase/functions/spacareer-create-customer-from-diagnosis/index.ts` … auth.users + members + spacareer_customers 一括生成（招待フローに転用）
- `supabase/functions/invite-member/index.ts` … `auth.admin.inviteUserByEmail` + Resend 経由のメール送付パターン
- `spacareer_social_style_responses` テーブル … 招待/回答/結果スコア（そのまま使用、`customer_id` 必須化方針）

## 実装ステップ

### Phase 1: DB / バックエンド
- [ ] **マイグレーション**: `spacareer_customers.social_style_completed_at` `social_style_type` カラム追加（一覧表示・強制リダイレクト判定用にdenormalize）＋ index
- [ ] **マイグレーション**: `spacareer_social_style_responses` のRLSを受講生本人 (`customer_id` の `members.user_id = auth.uid()`) が読み書きできる方向で見直し
- [ ] **新規 Edge Function** `spacareer-invite-customer`:
  - 入力: `name`, `email`
  - 処理: `auth.admin.inviteUserByEmail`（既存登録なら `resetPasswordForEmail`）→ `members`(rank='student', name, email, org_id, user_id) 作成 → `spacareer_customers`(member_id, nickname=name) 作成 → 招待中の `spacareer_social_style_responses`(customer_id, invite_email) を先回し挿入
  - 戻り: `customer_id`, `member_id`, `email`, `existingUser`
- [ ] 旧 `spacareer-create-customer-from-diagnosis` は当面残置（参照のみ）→ Phase 4 で削除判断

### Phase 2: 管理画面
- [ ] `DiagnosisInviteModal` を `CustomerInviteModal` にリネーム/拡張: 氏名フィールド追加、`spacareer-invite-customer` を呼ぶ、Slack文面コピペUIを廃止しメール送付ステータスを表示
- [ ] `SpacareerSocialStyleView` → `SpacareerCustomersView` 側に統合（招待〜受講管理を顧客一覧の上に置く）。本ビューは「診断状況サマリ」に再定義
- [ ] `CustomerListColumn` の各行に判定タイプバッジ追加（4タイプ色分け、未完了は淡色「診断中」）
- [ ] `TabBasicInfo` に「ソーシャルスタイル: ◯◯型」と判定スコアバランス（既存`ScoreBar`再利用）を追加
- [ ] **新規Tab** `TabSocialStyleGuide` または `TabBasicInfo` 末尾に「トレーナーの接し方指針（詳細版）」セクション追加。タイプ別に「会話の入り方 / フィードバックの伝え方 / モチベーション設計 / 宿題の難易度設計 / 避けるべき関わり / 期待される成長パターン」を表示

### Phase 3: クライアントポータル
- [ ] `SpacareerClientSidebar` の BASE_MENU に `social_style` を追加。`showSocialStyle`（未完了）/`showSocialStyleResult`（完了）のフラグで表示出し分け
- [ ] `SpacareerClientApp` ブートストラップに「自分の `spacareer_social_style_responses.completed_at` を確認」処理を追加。**未完了なら `currentTab='social_style'` に強制**（キックオフヒアリングと同じ仕組み、優先順位: ソーシャルスタイル > キックオフヒアリング）
- [ ] **新規 view** `ClientSocialStyleView.jsx`:
  - 未着手: 「ソーシャルスタイル診断を開始する」ボタン + 受講前ガイダンス
  - 進行中: 30問の1問ずつ進む UI（5段階リッカート、進捗バー、保存）
  - 完了: 結果画面（自分のタイプ・強み・成長余地・スコアバランス）
  - DBは既存 `spacareer_social_style_responses.answers/current_question_no/result_type/result_scores` を upsert

### Phase 4: 接し方指針の拡充
- [ ] `socialStyleQuestions.js` の `SOCIAL_STYLE_DESCRIPTIONS[type]` に下記フィールド追加（4タイプ × 各〜500字程度）:
  - `coach_detailed_guide`: 構造化オブジェクト
    - `conversation_opener`（会話の入り方の具体例）
    - `feedback_style`（フィードバックの伝え方）
    - `motivation_design`（動機付け方）
    - `homework_design`（宿題の設計傾向）
    - `avoid`（避けるべきコミュニケーション）
    - `growth_arc`（期待される成長パターン）
- [ ] 管理画面詳細TabにてMarkdown的に整形表示

## 検証
- [ ] 招待メール: テストメアドで送信成功、リンクから初回パスワード設定 → ログインまで
- [ ] 強制リダイレクト: 未完了状態で `/spacareer/mypage` 直アクセスでも診断画面に飛ぶ
- [ ] 完了後: 一覧でタイプバッジ、詳細TabBasicInfoでスコア+指針表示
- [ ] 既存スパキャリ顧客（小山さんのテストデータ等）でリグレッションなし

## メモ / 既知の影響範囲
- 既存の `/spacareer/social-style?token=XXX` URLは廃止予定（リダイレクトで`/login`へ）
- メモリ `feedback_spacareer_role_exclusive.md` 準拠: 招待先メアドは社内Spanavi members と重複しないこと（重複時は再利用せず明示エラー or 別UU運用）
- `members.rank='student'` 必須（既存App.jsx のリダイレクト判定が `profile.role==='student'`）
- 後方互換: `spacareer-create-customer-from-diagnosis` 経由で作られた既存顧客は触らない

### Phase 5: 第0回キックオフミーティング感想の義務化
- [ ] DB調査済: `spacareer_sessions` には既に `session_no=0` の行が顧客ごとに存在、`spacareer_session_feedbacks` は `session_id` で紐付くので**追加マイグレーション不要**
- [ ] **キックオフ完了トリガ追加**: `spacareer_sessions` で `session_no=0` の `completed_at` がセットされた際、`spacareer_session_feedbacks` 行を自動作成（既存の通常セッション完了トリガと同様。すでにある場合は session_no=0 を除外していないか確認、除外していたら撤廃）
- [ ] `ClientFeedbackView` 側の Select オプション表示を「第0回 キックオフミーティング感想」「第N回 感想」と出し分け（`session_no === 0` のとき）
- [ ] 既存稼働中の受講生（小山さんテストデータ）に対しては手動で `session_no=0` の feedback 行を1件投入してリグレッションテスト
- [ ] テンプレートは既存 `spacareer_templates.template_type='session_feedback'` をそのまま流用（第0回専用テンプレは作らない）
- [ ] 「事前課題と同様の義務化」の解釈確認: 未提出のままだと管理画面の「要対応」フラグが立つ運用に合わせる（`needAttention.js` を session_no=0 にも適用）

## 着手順
Phase 1 → Phase 2(招待UI) → Phase 3(クライアント診断UI) → Phase 4(指針詳細) → Phase 2(管理側指針表示) → Phase 5(キックオフ感想)
※ Phase 5 は他Phaseと独立しているため、Phase 1着手後の隙間で並行可

## 完了条件
- 管理画面から氏名+メアドを入れるだけで招待が走り、受講生が翌日30問完了し、運営が詳細指針を読んでセッションに入れる状態
