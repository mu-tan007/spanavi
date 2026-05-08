# Database チャット検索 ＆ CSV 出力強化

Database 画面（`src/components/views/DatabaseView.jsx` / 483K 社の `company_master`）に **自然言語チャット欄** を新設し、AI が会話から検索条件を抽出 → 日本語で要約してユーザー確認 → 既存フィルタに反映して検索する。会話履歴と「保存した検索条件」は org / user スコープで Supabase に永続化する。CSV 出力ボタンの権限制限も同時に整理する。

## 確定仕様（ユーザー合意済）

- チャット挙動: **「条件を自然言語で要約 → ユーザー確認 → 検索」**（confirm-then-execute）
- CSV対応: **Database のみ**（他画面は保留）
- 永続化: **会話履歴 と 保存検索条件の両方を残す**

## アーキテクチャ

```
┌─────────────────────────┐
│ DatabaseView.jsx        │
│  ┌────────┐ ┌────────┐ │
│  │ Chat   │ │Filter  │ │   ← 既存Filter は触らない
│  │ Panel  │ │Panel   │ │
│  └───┬────┘ └────────┘ │
│      │ filters 一括適用     │
│      ▼                  │
│  Result Table           │
└──────┬──────────────────┘
       │ AIに自然言語送信
       ▼
┌─────────────────────────┐
│ Edge Fn: chat-to-filter │  ← 新規
│  Anthropic Haiku 4.5    │
│  tool-use で filtersJSON│
│  と要約を返す            │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Supabase                │
│  database_chat_sessions │  ← 新規
│  database_chat_messages │  ← 新規
│  saved_company_searches │  ← 新規
└─────────────────────────┘
```

## 実装タスク

### 1. データベース（Supabase migration）

- [ ] `supabase/migrations/<ts>_database_chat.sql` を新規作成
  - 冒頭に `set local search_path = public, extensions;`（CLI push対応）
  - `database_chat_sessions(id uuid pk, org_id uuid, user_id uuid, title text, created_at, updated_at)`
  - `database_chat_messages(id uuid pk, session_id uuid fk, role text check in (user/assistant), content text, filters_json jsonb null, created_at)`
  - `saved_company_searches(id uuid pk, org_id uuid, user_id uuid, name text, filters_json jsonb, created_at)`
  - RLS: 全テーブルで `org_id = auth.jwt() org_id AND user_id = auth.uid()` 等価ポリシー（既存パターン踏襲）
  - インデックス: `(org_id, user_id, created_at desc)`

### 2. Edge Function 新規 `chat-to-filter`

- [ ] `supabase/functions/chat-to-filter/index.ts`
  - 入力: `{ messages: [{role, content}, ...] }`（過去会話含む）
  - Anthropic API を `claude-haiku-4-5-20251001` で呼ぶ（既存 `generate-company-info` のテンプレ流用）
  - **System prompt**: `INITIAL_FILTERS` のスキーマをそのまま JSON Schema で記述。返却フォーマットは tool-use もしくは構造化 JSON で固定:
    ```json
    {
      "summary": "東京都の製造業、社員50人以上、社長60代以上で検索します",
      "filters": { "prefecture": ["東京都"], "saibunrui": [...], "employeeMin": 50, "ageMin": 60, ... },
      "needsClarification": false,
      "clarifyQuestion": null
    }
    ```
  - 業種マッチは TSR 大分類/細分類のリストを system prompt に同梱して LLM に選ばせる（fetchCategories の結果をサーバ側でも持つ／クライアント送信）
  - JWT 検証で user_id / org_id を取り出して messages を `database_chat_messages` に永続化
  - エラー時は `needsClarification: true` で日本語の聞き返し文を返す

### 3. クライアントAPI `src/lib/databaseChatApi.js`（新規）

- [ ] `sendChatMessage(sessionId, userText)` → Edge Function 呼び出し → assistant メッセージ取得
- [ ] `createSession(title?)` / `listSessions()` / `loadSession(id)`
- [ ] `saveSearch(name, filters)` / `listSavedSearches()` / `deleteSavedSearch(id)`
- [ ] `applyFilters(filtersJson, currentFilters)` ← サーバ返却の filters を `INITIAL_FILTERS` にマージするヘルパ

### 4. UI 新規 `src/components/database/DatabaseChatPanel.jsx`

- [ ] 折りたたみ可能なサイドパネル（既存 FilterPanel の上または横に配置）
- [ ] 会話履歴の表示（user / assistant バブル）
- [ ] 入力 textarea + 送信ボタン
- [ ] AI が `filters` を返したら、メッセージ末尾に **「この条件で検索」「修正する」** の2ボタン
  - 「この条件で検索」押下 → `setFilter` 一括 → `doSearch(newFilters)`
  - 「修正する」押下 → 何もせず次の入力待ち
- [ ] `needsClarification: true` 時はボタンを出さず聞き返し文だけ表示
- [ ] 上部に「保存済み検索を呼び出す」ドロップダウン + 「現在の条件を保存」ボタン
- [ ] スパナビUI規約: 絵文字禁止、`Icon.jsx` / lucide-react、`constants/design.js` 流用

### 5. DatabaseView.jsx 統合

- [ ] `DatabaseChatPanel` を Filter の上に常時表示（折りたたみで初期は閉）
- [ ] `setFilters`（バルク更新版）を `useCompanySearch` から expose していることを確認（既にある）
- [ ] AI 提案 → 適用 後は既存の検索フローと完全に同じ

### 6. CSV 出力ボタンの権限

- [x] ユーザー確認済み: **現状維持（管理者のみ）**。今回は権限変更しない。

### 7. 動作確認（dev server）

- [ ] `npm run dev` で立ち上げ、Database 画面で:
  - チャットに「東京都の製造業、社員50人以上、社長60代以上」入力 → 要約が日本語で返る
  - 「この条件で検索」で実際に結果が絞り込まれる
  - 「修正する」→「やっぱり大阪も追加して」で prefecture が増える（履歴コンテキストが効く）
  - 検索条件を保存 → リロード → 呼び出して再現
- [ ] CSV 出力が 100 件以上のデータでも動くことを確認

### 8. デプロイ

- [ ] migration を本番に apply（低トラフィック時、RLS 大規模ではないが慎重に）
- [ ] `supabase functions deploy chat-to-filter`
- [ ] `git add -p && git commit && git push origin main`（自動 push 規約に従う）

## ハマりポイントの先回り

- **TSR 業種分類が大量**（saibunrui 数百種）→ system prompt 肥大化対策: 大分類だけ送って細分類は LLM の出力を後段で名寄せ、もしくは fetchCategories をクライアントから送る（サイズ次第）
- **空欄ハンドリング**: `revenueNullMode` などの enum をプロンプトに正確に記述しないと AI が誤値を入れる → JSON Schema を `"enum": ["", "include", "exclude"]` で明示
- **会話文脈**: messages 配列に過去 user / assistant 全部入れる（ただしトークン制御で直近6往復程度に切る）
- **org_id 保存忘れ**: edge fn で必ず JWT から org_id を引いて INSERT する（公開版バグの再発防止）
- **絵文字禁止**: アシスタントメッセージにも絵文字を出さないよう system prompt で明示

## 完了基準

- 自然言語で条件を伝えると AI が日本語要約 → 「この条件で検索」で結果が出る
- 過去会話と保存検索が次回ログインしても残っている
- CSV 出力（権限見直し含む）が動く
- main に push 済み、Vercel ビルド成功

## レビュー (2026-05-09)

実装・本番反映済み:
- DB マイグレーション: 3 テーブル (`database_chat_sessions` / `database_chat_messages` / `saved_company_searches`) + RLS + トリガ。supabase advisor の `function_search_path_mutable` も修正済み。
- Edge Function `chat-to-filter` (Anthropic claude-haiku-4-5) を本番に deploy、verify_jwt=true。
- フロント: `DatabaseChatPanel.jsx` を `DatabaseView` の上に折りたたみ配置。AI が要約 → 「この条件で検索」「修正する」ボタン。Ctrl+Enter で送信。
- 保存検索: 「現在の条件を保存」/ 「保存済みの条件を呼び出す」ドロップダウン + 削除ボタン。
- main に commit & push 済み（d35ba90、59cd3f0）。Vercel が自動ビルド。

未実施（要ユーザー側で動作確認）:
- ブラウザでの実機検証（自然言語 → 要約 → 検索 → CSV 出力）
- `ANTHROPIC_API_KEY` の Edge Function 環境変数（既存関数で使われているため設定済みのはず、未設定なら 500 を返すよう実装済み）
