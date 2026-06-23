# スパキャリ 事後課題：日時自動公開 ＋ 変動課題の後追い追加公開 設計

作成: 2026-06-23 / むー様指示に基づく

## 決定事項（むー様 2026-06-23）
1. **公開の基準時刻**: 各セッション行が持つ自分の `scheduled_at` を過ぎたら、その回の
   「セッション感想」＋「固定の事後課題」を自動公開（各回が自分の日時で公開）。
2. **変動課題の起点**: 事後課題タブに**専用ボタンを新設**して起動（セッション完了とは切り離す）。
3. **手動公開の扱い**: 固定部分は自動公開するが、**手動の停止/やり直し手段も残す**。

## 完了済み（先行修正・本番反映 commit 12c2fc1）
- 完了処理の `item_type` NOT NULL 違反を修正（固定/変動 bulk insert のキー集合統一）。
- ヒアリングチェック項目を第2回以降で2項目除外
  （キャリア方向性・価値観の再確認 / 次回事後課題の提出方法・締切の説明）。

## 用語と現状
- `spacareer_sessions.scheduled_at`：各回の予定日時（アンカー）。
- `spacareer_homework`：回ごとのヘッダ。`notified_at` が非NULLでポータル表示。
- `spacareer_homework_items`：課題項目（回答もここ）。`item_type`/`is_required`/`max_length` 等。
- `spacareer_homework_fixed_items`：第2回以降の固定課題マスター（全員共通）。
- `spacareer_session_feedbacks`：感想。`notified_at` が非NULLでポータル表示。
- 第1回の固定課題＝STEP1〜7 共通テンプレ（`spacareer_templates` template_type='homework_1'）。
- 第8回：卒業のため課題なし。

## 新フロー全体像
```
[各回 scheduled_at 経過]  ──(毎時 cron)──▶  固定事後課題＋感想を自動公開（notified_at）
[動画→議事録→ヒアリング]
[事後課題タブ「AI変動課題を生成」]──▶ AI生成(変動) → 運営が修正 →「追加公開」
                                              └─ 公開済み課題に変動項目を追記
```

## マイグレーション（新規）
1. `spacareer_homework_items`
   - `source text not null default 'variable'`（'fixed' | 'variable'）
   - `is_published boolean not null default true`（既存は公開済み扱い）
     - 固定項目は cron 公開時に `source='fixed', is_published=true`。
     - 変動ドラフトは `source='variable', is_published=false`、追加公開で true。
2. `spacareer_homework`
   - `fixed_published_at timestamptz`（固定自動公開の冪等フラグ）
3. （確認）`generate-spacareer-homework30` Edge Function のデプロイ状況。未デプロイなら本設計の前に実装/デプロイ。

## A. 自動公開（cron + Edge Function）
- 新 Edge Function `spacareer-publish-due-fixed`、毎時 pg_cron（既存 kickoff-hearing-reminder と同型）。
- 対象抽出：`scheduled_at <= now()`、`session_no in 1..7`、`homework.fixed_published_at IS NULL`。
- 各対象回 N の処理（冪等）:
  1. homework ヘッダ upsert（customer_id, session_no=N）。
     `status='unsubmitted'`、`notified_at=now()`、`fixed_published_at=now()`、
     `due_at = 次回 scheduled_at − 72h`（無ければ +7d）。
  2. 固定項目を投入（既に source='fixed' があればスキップ）:
     - N=1：STEP1〜7 共通テンプレ（homework_1）を `source='fixed'`。
     - N=2..7：`spacareer_homework_fixed_items` を `source='fixed'`（0件可）。
  3. 感想 `spacareer_session_feedbacks` を upsert し `notified_at=now()`、
     `due_at = 次回 scheduled_at − 3d`（既存トリガーが再スケジュール追従）。
  4. Slack 通知（portal_published）ベストエフォート。
- 既存の感想 autogen（完了トリガー）との整合：行作成は許容、`notified_at` は cron が立てる。
  完了トリガーが notified_at を立てているなら外す。

## B. 変動課題ボタン（事後課題タブ）
- TabHomework に「AI変動課題を生成」ボタン（第2〜7回・固定公開済みが対象）。
- 押下 → `generate-spacareer-homework30`（count = 30 − 固定数）→ `source='variable', is_published=false` で保存。
- HomeworkDraftReview を「公開済み課題の変動部分」を編集できるよう拡張：
  - 固定項目（source='fixed'）は読み取り中心、変動項目（source='variable'）を編集。
  - 「追加公開」で variable を `is_published=true`、homework.status 更新、Slack通知。
- ClientHomeworkView の項目取得に `is_published=true` 条件を追加（変動ドラフトを隠す）。

## C. 手動の停止/やり直し
- 事後課題タブに「固定公開を取り消す/再公開」操作（notified_at / fixed_published_at の操作）。

## 既存 completion フローの変更
- `SessionCompleteFlow.handleComplete`：第2〜7回の固定＋変動生成ブロックを撤去（cron＝固定／ボタン＝変動）。
- `publishHomework1`（第1回自動配信）撤去（cron が session1 で公開）。
- completion は「完了状態・進捗更新・キックオフ配信」のみに簡素化。

## 実装フェーズ
1. マイグレーション（items.source/is_published、homework.fixed_published_at）。
2. Edge Function `spacareer-publish-due-fixed` 実装＋デプロイ＋1件検証。
3. pg_cron 登録（毎時、Authorization+apikey 付与）。
4. クライアント表示（is_published フィルタ）＋ completion 簡素化。
5. 事後課題タブ：変動生成ボタン＋ドラフト編集拡張＋手動停止/再公開。
6. E2E 検証（scheduled_at を過去にして cron 手動 invoke → ポータル確認）。

## 実装状況（2026-06-23 完了・本番反映済み）
- [x] フェーズ1 マイグレーション 20260623100000（items.source/is_published、homework.fixed_published_at＋既存バックフィル）
- [x] フェーズ2/3 公開関数＋cron 20260623110000（fn_spacareer_publish_due_fixed、毎時25分 jobid=35）
      ※ DBのみで実装（Edge Function不使用）。Slack通知は未実装（ポータル表示で代替。必要なら後追い）。
- [x] フェーズ4 クライアント is_published フィルタ＋SessionCompleteFlow簡素化
- [x] フェーズ5 事後課題タブ HomeworkVariableEditor（変動AI生成→修正→追加公開、固定公開の停止/再公開）
- [x] 検証: 関数手動実行で第2回固定マスター9項目＋感想を公開（テスト太郎/福原）、既存ドラフト保護を確認

## 追加対応（2026-06-23 第2弾・本番反映済み）
- ポータル事後課題: 最新回をトップ表示（session_no降順）。福原さん第2回が第1回の下に隠れる不具合を解消。
- セッション感想: 「セッション時間は適切か」設問削除／「最低N文字」赤字表示を解除。
- 次回セッション開始日時: 入力即時の自動保存（保存ボタン不要・リフレッシュ競合解消）。
- 顧客管理: 「強み・価値観」タブ削除。
- 変動課題エディタを各回「セッション管理」タブへ移設（第2〜8回）。固定課題の内容も表示。
  記述/ファイル提出の切替を追加。
- 事後課題タブ: 提出サマリ＋回答内容ビューア（テキスト/添付ファイル）に再構成。
- 添付ファイルを署名付きURLで管理画面から閲覧可能に（HomeworkFileLink）。
- AI変動課題生成を「行動エビデンス(file提出)＋議事録ベース内省(text)」型に刷新（v3デプロイ）。
  感情/抽象/議事録未参照/感想・KOヒアリング重複は除外。
- 固定自動公開cron対象を第8回まで拡張。

## 残（任意・後追い）
- 自動公開時のSlack通知（cronから spacareer-slack-notify を pg_net で発火）。現状はポータル表示のみ。
- 変動課題AIプロンプトの本実装（設計書 spacareer-homework-engine-design.md の4階層分解）。現状はEdge Function既存版＋モックfallback。

## 検証時の注意（過去メモ）
- pg_cron からの Edge Function 呼び出しは Authorization+apikey 必須、config の verify_jwt は信用しない。
- Edge Function I/F 変更は main マージだけで終わらず本番 deploy＋1件検証。
- 本番 RLS 大規模変更は低トラフィック時に。
