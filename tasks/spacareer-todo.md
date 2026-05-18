# スパキャリ事業 ステップ2：基盤構築フェーズ

> 参照仕様書：`tasks/spacareer-spec.md`
> 並列実装の前段。1エージェント（メインClaude）で順次実行する。

## フェーズ計画

### Phase 2-0: 既存スパナビ構造の調査（並列調査）

- [ ] 0.1 既存スパキャリコード（applications / deals_career / members_career）と engagement registry の構造把握
- [ ] 0.2 既存ロープレタブの動画アップロード + AI議事録の実装パターン
- [ ] 0.3 認証・権限基盤、ロール判定、RLSパターン、共通レイアウト

### Phase 2-1: DBスキーマ定義

- [ ] 1.1 仕様書 §4.1 の19テーブルを Supabase migration で定義
- [ ] 1.2 RLSポリシーを3ロール（admin / trainer / student）に対応
- [ ] 1.3 既存 engagement registry に `spartia_career` の新ロール体系を組み込む
- [ ] 1.4 migration を local apply して動作確認
- [ ] 1.5 supabase db push でリモート反映

### Phase 2-2: 認証・権限基盤

- [ ] 2.1 ロール判定フック（`useSpacareerRole`）作成
- [ ] 2.2 受講生ロール用の Supabase Auth 設定
- [ ] 2.3 初回ログイン時の強制パスワード変更フロー
- [ ] 2.4 useAccessControl の spartia_career 対応拡張

### Phase 2-3: 事業切替ルーティング

- [ ] 3.1 受講生ロールの場合、ログイン直後にクライアントポータルへ強制ルーティング
- [ ] 3.2 受講生は事業切替UIにアクセス不可
- [ ] 3.3 運営・トレーナーは既存事業切替UIから「スパキャリ」を選択

### Phase 2-4: 共通レイアウト

- [ ] 4.1 運営ダッシュボード用サイドバー（8メニュー）
- [ ] 4.2 クライアントポータル用サイドバー（5メニュー + 左下メニュー）
- [ ] 4.3 各シェル（ヘッダー含む）

### Phase 2-5: 既存スパキャリコード削除

- [ ] 5.1 src/components/views/career/* 削除
- [ ] 5.2 src/components/common/sidebars/SpartiaCareerSidebar.jsx 削除（新規に置換）
- [ ] 5.3 page registry の旧スパキャリ参照を整理
- [ ] 5.4 SpanaviApp.jsx の旧ルーティング削除

### Phase 2-6: 検証

- [ ] 6.1 `npm run build` 通過
- [ ] 6.2 既存ソーシング機能が壊れていないことを確認
- [ ] 6.3 main に push してデプロイ確認

## 完了条件

- ステップ3（並列実装6エージェント）が独立して着手できる状態になっていること
- 既存ソーシング機能が完全に壊れていないこと
- DBスキーマが固定され、各エージェントは触らない前提が成立していること

## Review

（実装後に記入）
