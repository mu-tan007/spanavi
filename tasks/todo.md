# スパキャリ セッション動画アップロード＋AI議事録の本実装

ロープレ機能（Whisper文字起こし→Claude分析）と同じ要領で、スパキャリの受講生面談動画から議事録を生成できるようにする。

## 現状（調査済）

- 動画アップロード（TUS / `spacareer-session-videos` バケット 2GB）は実装済み（SessionCompleteFlow / TabKickoff の2箇所）
- Edge Function `analyze-spacareer-session`（Whisper + Claude Haiku 4.5 → `minutes_draft`）はリポジトリに存在するが **本番に未デプロイ**
- 「AI議事録を生成」ボタンは **モック実装**（`lib/spacareer/ai/mock` の `generateMinutesDraft`）のまま
- 課題1: 動画(〜2GB)をそのままWhisperに渡せない（Edge Function は冒頭でtruncate）→ ロープレ同様、ブラウザでMP3抽出(ffmpeg.wasm 32kbps)してから音声を渡す
- 課題2: 本番バケットの allowed_mime_types が video/* のみ → 音声MP3を許可する必要あり
- 課題3: Edge Function の `spacareer_ai_usage_logs` insert に org_id が無く NOT NULL 制約で失敗する

## 実装計画

- [x] 1. migration: `spacareer_session_videos.audio_storage_path` 追加 + バケットに audio MIME 許可
- [x] 2. 共通ヘルパー `src/lib/spacareer/sessionMinutes.js`
  - `uploadSessionVideoWithAudio()`: TUS動画アップ + MP3抽出/アップ + レコード作成（音声抽出失敗時は動画のみで続行＋警告）
  - `generateSessionMinutes()`: Edge Function invoke + ai_status ポーリング（5秒間隔/最大10分）
- [x] 3. Edge Function 改修: 行から audio_storage_path/org_id を解決、音声優先、usage_logs に org_id、truncate上限を24MBへ
- [x] 4. SessionCompleteFlow.jsx / TabKickoff.jsx をモック→本実装に置換（アップロード完了後に議事録生成を自動起動、ボタンは再生成用に残す）
- [x] 5. 本番反映: migration apply + Edge Function deploy（feedback_edge_function_deploy_check 準拠）
- [x] 6. `npm run build` 通過確認 → commit & push

## Review

- migration `20260610120000_spacareer_session_video_audio_path` 適用済（audio_storage_path 追加・バケット audio MIME 許可・上限2GB維持）
- `analyze-spacareer-session` v1 を本番デプロイ。session_video_id から org/audio/storage を自動解決、音声優先、usage_logs org_id 対応、truncate 24MB
- フロントは共通ヘルパー経由に統一。アップロード後に議事録生成が自動で走り、TabSessionHistory / TabKickoff の表示が自動更新される
- 検証: パラメータ不足リクエストに 400 を返すことを本番で確認。実動画での E2E はむー様の次回アップロード時に確認

---

# （旧）Analytics / Performance 統合ページ実装（未着手・保留）

現状 `StatsView.jsx`（Analytics）と `PerformanceView.jsx`（Performance）が別ページで分かれており、数字の二重管理・スコープ切替の不自由・打ち手への接続不足が課題。これらを単一の戦略分析ページ `AnalyticsView.jsx` に統合し、組織 → チーム → 個人 をドリルダウンできる設計に再構築する。

## 確定仕様（合意済）

### ページ構成
1. グローバルフィルタ（sticky）: スコープ（組織/チーム/個人）/ 期間（今日/今週/今月/カスタム。四半期は不要）/ 比較（前期間のみ。前年同期は不要）/ リスト絞込
2. KPIスコアカード（売上 / アポ数 / 架電数 / アポ率 / 社長接続率 / リスケ+キャンセル率）に **ペースゲージ**（着地予測とビハインド/先行）を同居
3. コンバージョンファネル: **架電 → 社長接続 → アポ → 実施 → 受注 → 売上**（「接続」は削除）
4. 推移グラフ（日次/週次/月次切替）
5. メンバーランキング＆比較テーブル（PersonDetailModal再利用）
6. 時間帯×曜日ヒートマップ（スコープ：組織/チーム/個人/**リスト**）
7. クライアント別・リスト別パフォーマンス
8. 打ち手ボード（Action Items）
9. リスト投入推奨アラート（**進捗率500%以上のリストのみ**赤表示、未満は非表示）
10. 強み/弱みカード（平均との差分）

### 算出ロジック（既存と完全一致）
- 架電数: `call_records` 全行
- 社長接続: `ceoConnectLabels` (= `ceo_connect:true` = 社長再コール+社長お断り+アポ獲得)
- アポ数: `status = 'アポ獲得'`
- リスケ率/キャンセル率: `appointments` 由来
- 稼働時間: 人×日単位で `min(called_at) 〜 max(called_at)` 合算

### Must / Should / Nice-to-have
- **Must**: 統合ページ構成、リスト別ヒートマップ、打ち手ボード、ペースゲージ
- **Should**: リスト投入推奨アラート、強み/弱みカード
- **Nice-to-have**: コホート分析、週次MTGスナップショット（後回し）

## フェーズ計画

### Phase 1: コアスキャフォールディング（MVP）
- [ ] 1.1 `AnalyticsView.jsx` 新規作成（StatsView を置換）
- [ ] 1.2 グローバルフィルタバー（スコープ・期間・リスト絞込）
- [ ] 1.3 KPIスコアカード 6枚（前期間比バッジ付）
- [ ] 1.4 コンバージョンファネル（架電→社長接続→アポ→実施→受注→売上）
- [ ] 1.5 推移グラフ（日/週/月切替、売上/アポ/架電/アポ率タブ）
- [ ] 1.6 メンバーランキングテーブル（PersonDetailModal再利用）
- [ ] 1.7 時間帯×曜日ヒートマップ（スコープ対応、リスト含む）
- [ ] 1.8 クライアント別・リスト別パフォーマンスセクション移植
- [ ] 1.9 SpanaviApp.jsx のルーティング差替（Analytics に統合、Performance タブ削除）
- [ ] 1.10 `npm run build` 通過確認

### Phase 2: 戦略支援機能
- [ ] 2.1 ペースゲージ（KPIカード内に着地予測・ビハインド/先行表示）
- [ ] 2.2 打ち手ボード（自動推奨アクション 3-5件）
- [ ] 2.3 リスト投入推奨アラート（進捗率≥500%のみ赤表示）
- [ ] 2.4 メンバー強み/弱みカード（平均との差分）

### Phase 3: Nice-to-have（後回し）
- [ ] 3.1 コホート分析
- [ ] 3.2 週次MTGスナップショット出力
