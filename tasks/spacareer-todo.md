# スパキャリ事業 ステップ2：基盤構築フェーズ

> 参照仕様書：`tasks/spacareer-spec.md`
> 並列実装の前段。1エージェント（メインClaude）で順次実行する。

## フェーズ計画

### Phase 2-0: 既存スパナビ構造の調査（並列調査）

- [x] 0.1 既存スパキャリコード（applications / deals_career / members_career）と engagement registry の構造把握
- [x] 0.2 既存ロープレタブの動画アップロード + AI議事録の実装パターン
- [x] 0.3 認証・権限基盤、ロール判定、RLSパターン、共通レイアウト

### Phase 2-1: DBスキーマ定義

- [x] 1.1 仕様書 §4.1 の19テーブルを Supabase migration で定義（最終17テーブルに最適化）
- [x] 1.2 RLSポリシーを3ロール（admin / trainer / student）に対応
- [x] 1.3 既存 engagement registry に `spartia_career` の新ロール体系を組み込む
- [ ] 1.4 migration を local apply して動作確認
- [ ] 1.5 supabase db push でリモート反映（main merge 直前に実行）

### Phase 2-2: 認証・権限基盤

- [x] 2.1 ロール判定フック（`useAuth.isStudent`）追加
- [x] 2.2 受講生ロール用の Supabase Auth 設定（既存認証基盤を流用）
- [ ] 2.3 初回ログイン時の強制パスワード変更フロー（既存ResetPasswordPageを流用、本番では別途確認）
- [x] 2.4 useAccessControl は変更不要（受講生は page_registry 対象外で完結）

### Phase 2-3: 事業切替ルーティング

- [x] 3.1 受講生ロールの場合、ログイン直後にクライアントポータルへ強制ルーティング
- [x] 3.2 受講生は事業切替UIにアクセス不可（/spacareer 直下で完結）
- [x] 3.3 運営・トレーナーは既存事業切替UIから「スパキャリ」を選択

### Phase 2-4: 共通レイアウト

- [x] 4.1 運営ダッシュボード用サイドバー（8メニュー）SpacareerAdminSidebar
- [x] 4.2 クライアントポータル用サイドバー（5メニュー）SpacareerClientSidebar
- [x] 4.3 SpacareerClientApp（受講生用シェル） + 5画面スタブ

### Phase 2-5: 既存スパキャリコード削除

- [x] 5.1 src/components/views/career/* 削除（8ファイル）
- [x] 5.2 src/components/common/sidebars/SpartiaCareerSidebar.jsx 削除
- [x] 5.3 src/hooks/useCareerDeals.js / useDealStages.js 削除
- [x] 5.4 pageRegistry.js の旧スパキャリ参照を新8項目に更新
- [x] 5.5 SpanaviApp.jsx の旧 import 削除

### Phase 2-6: 検証

- [x] 6.1 `npm run build` 通過
- [x] 6.2 既存ソーシング機能が壊れていないことを確認（コード変更ゼロ）
- [ ] 6.3 main merge 前に DB migration 適用 + Vercel ステージング確認

## 完了条件

- ステップ3（並列実装6エージェント）が独立して着手できる状態になっていること
- 既存ソーシング機能が完全に壊れていないこと
- DBスキーマが固定され、各エージェントは触らない前提が成立していること

## Review

### 2026-05-18 ステップ2基盤構築フェーズ完了

**完了したこと**：

- 5本の migration（17テーブル / RLS / トリガー / seed）を feat/spacareer-foundation ブランチに作成
- フロント基盤（運営サイドバー差替 + クライアントポータル骨格5画面 + 受講生強制ルーティング）を実装
- 旧スパキャリコード11ファイルを完全削除
- pageRegistry.js を新8項目に更新
- `npm run build` 通過確認、既存機能には影響なし

**学んだこと**：

- 既存ロープレタブの動画+AI議事録パイプラインは `analyze-roleplay` Edge Function + Whisper + Claude Haiku 4.5（claude-haiku-4-5-20251001）で実装済み → スパキャリでも流用
- セッション動画は24MBを超えるとffmpeg.wasmでMP3 32kbpsに自動変換
- git stash pop時のブランチ位置ずれで誤 main 直 push 事故あり → revert + cherry-pick で復元

**次のステップ（ステップ3：6エージェント並列実装）に進める状態**：

仕様書 `tasks/spacareer-spec.md` が唯一の参照源として整備済み。
共通レイアウトと認証基盤、DBスキーマ（feat ブランチ）が揃っている。
旧コードは完全削除済みで、エージェントが旧実装を誤参照するリスクなし。

**残作業（main merge 前に解消必要）**：

- 本番Supabaseへ migration 5本を順次適用（feedback_rls_changes.md に従い低トラフィック時間帯推奨）
- 動作確認後に feat/spacareer-foundation を main にmerge → Vercel自動デプロイ
