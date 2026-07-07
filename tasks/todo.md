# スパキャリ 改修タスク（2026-07-07）

むー様依頼: (1)AI議事録エラー修正 (2)コース/プラン柔軟化 (3)Zoom録画・画面内再生

方針決定: Zoom=API自動取り込み / コース=各回(1)(2)パート分割 / 着手順=3a→2→3b

※ 前タスク(2026-06-29)で議事録の「空でした」対策として assistant prefill を追加したが、
   sonnet-4-6 が prefill 非対応で今回のエラーの原因になっていた。本タスクで置換済。

---

## Part 1. AI議事録エラー修正 ✅ 完了・本番反映済

- [x] 根本原因: analyze-spacareer-session が sonnet-4-6 非対応の assistant prefill("{") を使用
      → `This model does not support assistant message prefill` (400) で 6/29以降 全件失敗
- [x] 修正: prefill 廃止 → structured outputs（output_config.format + MINUTES_SCHEMA）へ置換
      （prefill 400 と 旧来の ```json 混入/出力途切れ の両方を根治）
- [x] 成功時に古い ai_error をクリア
- [x] 本番デプロイ（supabase functions deploy）
- [x] 実データ検証: 失敗セッション再実行 → ai_status=done / 文字起こし1万字 / トピック8件
- [x] commit & push（main）

## Part 3a. 録画の画面内再生 ✅ 完了

- [x] 再利用可能な画面内プレーヤー SessionVideoModal.jsx を作成
      （非公開バケットのため署名付きURL→<video>。営業代行ロープレと同方式）
- [x] TabSessionManage（第1〜8回）に「録画を再生（画面内）」追加、Zoomリンクは別タブ表示に整理
- [x] TabKickoff（第0回）にも同様に追加
- [x] npm run build 成功
- [x] commit & push

## Part 2. コース選択・プラン変更の柔軟化

### バックエンド基盤 ✅ 完了・本番適用/検証済（migration 20260707120000）
- [x] spacareer_customers.course（'kyoka'/'oyo'）追加
- [x] spacareer_sessions.part(1,2) 追加、unique を (customer_id,session_no,part) に
- [x] トリガー3種を course/part 対応に書換（進捗=完了/全セッション数、強化=/9で従来と等価）
- [x] ヘルパー fn_spacareer_recalc_progress / fn_spacareer_reset_next_up
- [x] コース変更RPC fn_spacareer_set_course（記録保持で(N,2)増減・往復可逆）
- [x] 検証: 既存12名 全kyoka/108セッションpart1、RPC往復で原状復帰を確認
- 決定事項: (2)は宿題なし（宿題は第N回=part1のみ）／進行は手動選択＋next_upヒント

### 管理画面UI ✅ 実装・ビルド確認済（push済）
- [x] コース選択/変更UI（RightSidebar CourseCard）→ supabase.rpc('fn_spacareer_set_course')
      ソーシャルスタイル併記。基本情報/メンバータブに表示
- [x] セッション管理タブを part 対応（index.jsx。順序(session_no,part)で段階表示・補填タブ出現）
- [x] TabSessionManage を part 引数対応（targetSession/prev/next を順序ベース、"第N回(2)"表示、
      (2)は事後課題エディタ非表示）
- [x] ProgressStepper を oyo 対応（分母=sessions.length、(2)ノード=「N'」表示）
- [x] RightSidebar 進捗 total 動的化・回ラベル(2)対応
- [x] クライアントポータル ClientHistoryView に (2) セッション表示
- [x] TabSessionHistory / SpacareerSessionsView(横断) の (2) 対応・行id衝突解消
- [x] useCustomersList のセッションselectに part 追加
- [x] npm run build 成功
- [ ] 実UI動作確認（むー様: 1名を応用に変更→(2)タブ/補填/受講生ポータル表示を確認）
- 補足: 宿題(TabHomework/HomeworkMatrix)は(2)に紐付けないため変更不要

## Part 2(旧). 元の設計メモ（参考・上に統合済）

設計（各回(1)(2)パート分割案）:
- spacareer_sessions に `part smallint default 1` 追加、unique(customer_id, session_no, part)
- コース: spacareer_customers に course（'kyoka'=強化8回 / 'oyo'=応用16回）追加
- 強化=各回 part1 のみ / 応用=各回 part1+2（= 16セッション）
- 強化→応用 変更時: 不足 (N,2) 行を not_started で INSERT（既存記録は保持=引き継ぎ）
- 進捗/卒業判定を course のセッション数基準へ
- 未実施 (N,2) を任意順で後から完了できる「補填」対応（自動advance＋手動選択の併用）
- ソーシャルスタイル診断と紐付けたプラン割当/変更UI
- 影響UI: ProgressStepper / TabHomework / SpacareerSessionsView / RightSidebar /
  HomeworkMatrix / ClientHistoryView / useCustomers のセッションタブ生成
- マイグレーション + トリガー（作成/advance/進捗同期）改修 + データ移行（既存全員=強化割当）

- [ ] 詳細設計の確定（宿題の(2)扱い・進行制御UI）
- [ ] マイグレーション作成・適用
- [ ] トリガー改修
- [ ] 管理画面UI改修（社内＋クライアントポータル両方）
- [ ] 動作確認

## 追加対応（むー様指示 2026-07-07 夕）✅ 完了

- [x] キックオフ感想の撤廃: fn_spacareer_create_session_feedback で session_no=0 をスキップ
      （migration 20260707140000）。既存のキックオフ感想履歴は残す（管理画面で確認可）
- [x] クライアントポータルの感想からキックオフ(第0回)を除外（ClientFeedbackView）
- [x] バグ修正: キックオフ未完了なのに第1回タブが出る不具合
      ・index.jsx タブ表示条件から next_up を除去（唯一のゲート=「直前が completed」）
      ・useSessionCompletion の二重更新（session_no+1 の maybeSingle 昇格＋/9固定進捗）を撤廃し
        DBトリガー(reset_next_up/recalc_progress)に一本化（応用のmaybeSingleエラー＆進捗クロバーも解消）
- [x] 応用コースを名前の横に金色バッジ「応用コース」で表示（index.jsx ヘッダー、course='oyo'時）
- [x] npm run build 成功 / 本番データで表示ルールの無害性を検証

## Part 3b. Zoom録画 API自動取り込み ❌ 中止（むー様指示 2026-07-07）

方針変更: Zoom録画リンクの貼付・再生・議事録生成は取りやめ。動画は「アップロード
（ボタン or ドラッグ＆ドロップ）」のみ。アップロード動画は画面内で再生できるように。
- [x] TabKickoff / TabSessionManage から Zoom録画 共有リンク入力＋「Zoomで開く」を撤去
- [x] TabSessionHistory の「録画を開く」(recording_url)を撤去→アップロード動画の画面内「再生」に置換
- [x] 動画アップロード（ボタン＋D&D）＋画面内再生の導線に一本化
- [x] npm run build 成功
- 補足: recording_url カラムはDBに残置（UIからは不使用・無害。DROPしない）
- 補足: クライアントポータルの zoom_url 列は録画リンクと別概念のため残置

## Part 3b(旧). Zoom API自動取り込み案（参考・中止）

- 既存 Zoom S2S OAuth 基盤（get-zoom-recording / receive-zoom-webhook / sync-zoom-users）活用
- ミーティング録画 API または recording.completed Webhook で
  録画を自動DL → spacareer-session-videos 保存 → analyze-spacareer-session キック
- 必要に応じ Zoom アプリに cloud_recording:read スコープ追加（むー様側作業の可能性）
- セッションと録画の紐付け（開催日時/ホスト/参加者でマッチ）

- [ ] Zoom ミーティング録画取得の方式確定
- [ ] 取り込み Edge Function 実装
- [ ] セッション紐付け・自動議事録キック
- [ ] 動作確認

---

## レビュー / 結果メモ

- Part 1: 議事録は構造化出力へ移行し全件復旧。管理画面から失敗回を「再分析」で通る。
- Part 3a: アップロード済み録画（Zoom自動取り込み後も同バケット）を画面内再生。
  Zoom共有リンクは X-Frame-Options で埋め込み不可のことが多く別タブ表示のまま。
