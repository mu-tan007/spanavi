# スパキャリ修正タスク（2026-06-24）

むー様指示の4領域。全て推奨案で確定済み。

## #1 動画アップロード・議事録生成

### #1a スキップ後も動画/議事録ができる
- [ ] `SessionCompleteFlow.jsx`: 「スキップして完了」後も動画アップロード/議事録生成ボタンを有効化
  - `disabled={status === 'completed'}` を撤廃（アップロード・議事録ボタン・ドロップゾーン）
  - `doUpload` 冒頭の `if (status === 'completed') return;` を撤廃
- [ ] `TabKickoff.jsx` / `TabSessionManage.jsx`: 同様に完了後もアップロード/議事録ボタンを有効化

### #1b 画面移動でも処理が止まらない
- [ ] 新規 `SessionJobsContext.jsx`（CustomerDetail階層に常駐）を作成
  - アップロード+音声抽出+議事録ポーリングを Provider 側で実行 → タブ切替でアンマウントされない
  - `jobsBySession` でセッション毎の phase/進捗/エラーを保持
  - 完了時に `refresh()` 呼び出し
  - フローティング進捗インジケータを表示
  - mount時に ai_status が pending/processing の動画を検出して議事録ポーリング再開
- [ ] `CustomerDetail/index.jsx`: タブ群を `<SessionJobsProvider>` でラップ
- [ ] `SessionCompleteFlow` / `TabKickoff` / `TabSessionManage`: ローカルstateの代わりに context を利用

## #2 保存エラー・強制ログアウト改善（受講生 全入力画面）
- [ ] 新規 `src/lib/spacareer/draftCache.js`: localStorage 下書き保存/復元/破棄
- [ ] 新規 `src/lib/spacareer/saveWithRetry.js`: 認証エラー時に refreshSession→1回リトライ
- [ ] `ClientKickoffHearingView.jsx`: 入力毎に下書き保存、ロード時に新しい下書きを復元、保存をリトライ化、失敗してもログアウトせず下書き保持
- [ ] `ClientHomeworkView.jsx`: 同上（answers/files）
- [ ] `ClientFeedbackView.jsx`: 同上（score/freeComment/responses）
- [ ] 失敗時メッセージを「端末に保存済み・再ログインで復元」に変更（データ消失の不安を解消）

## #3 キックオフ管理の日程
### #3a/#3b TabKickoff
- [ ] 「第1〜第8回 大枠日程」カード（8日付入力）を削除、第1回開始日時のみ残す
- [ ] `handleSave` の session_2〜8 scheduled_at 一括書込ループを削除（第1回 scheduled_at は維持）
- [ ] `buildForm` から session_2〜8_date を削除

### #3c 顧客側 毎週自動仮置き（確定優先）
- [ ] 新規 `src/lib/spacareer/sessionSchedule.js`: 第1回基準で `第1回 + 7日×(n-1)` を算出。scheduled_at があればそれを優先
- [ ] `ClientHistoryView.jsx`: 第2〜8回で scheduled_at が無ければ毎週自動算出日を「仮決め」表示
- [ ] `ClientMyPageView.jsx`: 次回セッションの scheduled_at が無ければ自動算出日を表示

## #4 ヒアリングシート項目変更
### TabSessionManage（第1〜8回）
- [ ] `check_values_review`（キャリアの方向性・価値観の再確認）を削除 #4d
- [ ] `check_next_homework_guide`（次回事後課題の提出方法・締切の説明）を削除 #4c
- [ ] `check_unclear_points`（不明点の洗い出し）を全回共通で追加 #4b
- [ ] firstOnly 機構が不要になるので整理

### TabKickoff（第0回）
- [ ] `check_all_sessions_dated`（第2〜8回 全回の仮日程の確定）を削除 #4a
- [ ] 「事後課題についての説明」「締め切りについての説明」は残す（#4c は第1〜8回のみ）

## 検証
- [ ] `npm run build` でビルド通過
- [ ] RightSidebar/needAttention の check キー参照が壊れないか確認
- [ ] 影響範囲レビュー（既存完了セッション・既存scheduled_atへの後方互換）

## レビュー（実装後記入）

実装完了（2026-06-24）。`npm run build` 通過。

### 変更ファイル
- 新規 `src/lib/spacareer/draftCache.js` / `saveWithRetry.js` / `sessionSchedule.js`
- 新規 `.../CustomerDetail/SessionJobsContext.jsx`（常駐ジョブProvider＋右下フローティング進捗）
- `SessionCompleteFlow.jsx` / `TabKickoff.jsx` / `TabSessionManage.jsx`: 動画/議事録を常駐Provider経由に。完了後も操作可（#1a/#1b）
- `TabKickoff.jsx`: 大枠日程カード削除→第1回開始日時のみ、check_all_sessions_dated削除（#3a/b, #4a）
- `TabSessionManage.jsx`: check項目を整理（不明点の洗い出し追加／価値観・次回課題提出方法削除）（#4b/c/d）
- `ClientHistoryView.jsx` / `ClientMyPageView.jsx`: 第1回基準の毎週自動仮置き（確定優先）（#3c）
- `ClientKickoffHearingView.jsx` / `ClientHomeworkView.jsx` / `ClientFeedbackView.jsx`: localStorage下書き＋トークン更新リトライ＋非破壊メッセージ（#2）
- `CustomerDetail/index.jsx`: SessionJobsProvider でラップ

### 既知の範囲外
- #1b の「ページ完全リロード後の処理復帰」は対象外（SPA内のタブ/画面移動での継続のみ実装）。Edge Function側の議事録生成はサーバーで継続するため、再読込後は ai_status 反映で結果は取得される。
- 既存顧客で旧一括入力済みの第2〜8回 scheduled_at は「確定」扱い（確定優先のため仕様通り）。
