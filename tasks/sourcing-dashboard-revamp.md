# 営業代行ダッシュボード再設計（個人視点ページへ転換）

対象: `src/components/views/SourcingDashboardView.jsx`
合意日: 2026-05-24

## ゴール
「自分の数字を徹底的に分析し、弱みを把握し、アクションプランに落とす」**1ページ完結の個人視点ページ**。組織横断・チーム横断の分析は別画面（アナリティクス）に任せる。

## 役割分担（ダッシュボード vs アナリティクス）
| | ダッシュボード | アナリティクス |
|---|---|---|
| 視点 | **個人**（自分の数字） | **組織/チーム横断** |
| 主ユーザー | 全メンバー | 篠宮・チームリーダー |
| スコープUI | ロールにより自分固定 or メンバー切替 | 組織/チーム/個人ドリルダウン |
| 週次コーチング | あり（篠宮が書く） | なし |

> アナリティクスの統合計画は `tasks/todo.md` に既存。本ファイルとは独立に進む。

---

## Phase 0: デッドコード掃除

`SourcingDashboardView.jsx` には render から消えただけで以下の不要コードが約230行残置されている：

- [ ] state: `overdueReceptionRecalls`, `overdueRecalls`, `oldRejections`, `reapproachCandidates`, `recallLoading`
- [ ] useEffect 内の RPC 4本（`dashboard_overdue_reception_recalls` / `dashboard_overdue_recalls` / `dashboard_old_rejections` / `dashboard_reapproach_candidates`）と `mapRecall` ヘルパ
- [ ] `topLists` useMemo
- [ ] `queueRef` / `resolveFullList` / `openQueueItemAtIdx` / `openQueue`（架電キュー機能はスマートキュー側で完結）
- [ ] サブコンポーネント: `CallButton`, `CollapsibleList`
- [ ] import: `TopListCard`, `Phone`, `fetchAllRecallRecords`, `fetchMemberPayrollHistory`（未使用）
- [ ] props: `callListData`, `setCallFlowScreen`, `setSelectedList`（再設計後に必要なもののみ残す）
- [ ] コメントブロック (lines 433-438) — 再設計後は不要

## Phase 1: スコープUI改修

現状の `自分 / 成尾チーム / 高橋チーム / 組織全体` 4ボタンを**ロール別メンバー切替**に変更：

- [ ] 一般メンバー: スコープUI非表示（自分固定）
- [ ] チームリーダー（`role === 'チームリーダー'` で `members.team === 自team`）: **自チームメンバーのみのセレクタ**を表示
- [ ] 管理者（`isAdmin === true` = 篠宮）: **全メンバーセレクタ**を表示
- [ ] チーム集計・組織集計はUIから消す（後段の分析で「チーム平均」「組織TOP」を**比較値**として裏側で利用）

## Phase 2: ① 進捗確認 (Hero)

- [ ] 月次5指標カード（架電 / キーマン接続 / アポ / 売上 / インセンティブ）
  - 各カード: 実績 / 目標 / 達成率 / **残営業日** / **月末着地予測**
  - 着地予測: `current_pace_per_day × 残営業日 + 現在実績`
  - 着地予測が目標未達なら警告色、達成見込みなら成功色
- [ ] 本日積み上げサマリ（架電 / 接続 / アポ の3カード ─ 既存の TodayCard 流用可）
- [ ] 「本日中に必要な追加件数」表示
  - `必要追加件数 = ceil((月次目標 - 現在実績) / 残営業日) - 本日実績`

## Phase 3: ② 数字分析 (Analytics)

- [ ] ファネル可視化: 架電 → キーマン接続 → アポ → 売上
  - 各段階の率を「**自分 / チーム平均 / 組織TOP**」3列横並びで比較
- [ ] 30日推移チャート（日次: 架電 / 接続 / アポ ─ Recharts）
- [ ] 時間帯×曜日ヒートマップ（接続率 or アポ転換率）
  - 縦: 曜日（月〜土）/ 横: 9〜19時を1時間刻み
- [ ] リスト別パフォーマンス TOP3 / BOTTOM3（接続率順）

## Phase 4: ③ 週次コーチング（篠宮の脳をAIに学習させる仕組み）

### DBスキーマ追加

```sql
-- 週次コーチングコメント
create table coaching_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  target_member_id uuid not null,             -- 対象メンバー
  period_start date not null,                  -- 週の月曜
  period_end date not null,                    -- 週の日曜
  ai_draft text,                               -- AI生成ドラフト（学習データ）
  final_text text,                             -- 篠宮編集後の最終
  author_id uuid not null,                     -- 書いた人（=篠宮）
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (target_member_id, period_start)
);

-- 週次KPIスナップショット（AI context用）
create table member_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  period_start date not null,
  period_end date not null,
  calls int default 0,
  connects int default 0,
  appos int default 0,
  sales numeric default 0,
  connect_rate numeric,
  appo_rate numeric,
  created_at timestamptz default now(),
  unique (member_id, period_start)
);

-- pg_cron: 毎週月曜 06:00 で前週分を集計
```

### RLS
- `coaching_comments`
  - SELECT: 篠宮 / 対象メンバー本人 / 対象メンバーのチームリーダー
  - INSERT/UPDATE: **篠宮のみ**（学習データを篠宮スタイルに統一）
- `member_kpi_snapshots`: 篠宮 + 対象本人 + チームリーダーがSELECT可、INSERTはcronのみ

### UI
- [ ] 週次コーチングセクション（ダッシュボード下部）
  - 直近のコメント表示（メンバー本人・リーダーは閲覧専用）
  - 過去履歴タイムライン（折りたたみ）
  - 篠宮閲覧時のみ: 「AIドラフト生成」ボタン
    - クリックで `gen-coaching-draft` Edge Function 呼び出し
    - ドラフトをテキストエリアに展開
    - 篠宮編集後 `final_text` 保存
- [ ] スコープがメンバー切替で他人を見ている場合のみ表示（自分視点では「最新の篠宮コメント」を読む側）

### Edge Function
- [ ] `supabase/functions/gen-coaching-draft/index.ts`
  - 入力: `target_member_id`, `period_start`, `period_end`
  - context: 過去の全 `coaching_comments.final_text` + 対象期間の KPI snapshot + 直近4週推移
  - Claude API (`claude-sonnet-4-6` 推奨) で生成
  - prompt: 「あなたは篠宮拓武。下記は過去の自分のコーチングコメント集と今週の対象メンバーKPI。同じ口調・観点で今週分を書け」
  - レスポンス: `{ ai_draft: string }`

## Phase 5: ④ アクションプラン

- [ ] コメント内 Markdown チェックボックス記法 `- [ ] 〇〇する` を許可
- [ ] レンダリング時にチェックボックスとして展開（メンバー本人が完了チェック可）
- [ ] 完了状態は別テーブル `coaching_action_items` に保存
  ```sql
  create table coaching_action_items (
    id uuid primary key,
    coaching_comment_id uuid references coaching_comments(id),
    text text,
    done bool default false,
    done_at timestamptz
  );
  ```
- [ ] 完了率は次回 AI ドラフト生成時の context に追加（フォロー強化のため）

---

## 実装順序

```
Phase 0 → 動作確認 → Phase 1 → 動作確認 → Phase 2 → 動作確認
       → Phase 3 → Phase 4 (DB + Edge Function + UI) → Phase 5
```
各 Phase ごとに commit & push。Supabase migration は CLI で push。

## 合意ポイント（2026-05-24 確定）

1. ダッシュボード=個人視点、アナリティクス=組織視点で完全に住み分け
2. スコープ: 自分固定が原則。篠宮（全員）と チームリーダー成尾・高橋（自チーム）のみメンバー切替可
3. 弱み把握＆アクションプランは **AI 単独では不可能** → 篠宮の週次自然言語コメント主軸
4. AI は篠宮コメントを学習データとして蓄積し、毎週ドラフト生成に活用
5. AI ドラフト生成は **篠宮の手動ボタンクリック時のみ**（cron 自動化は将来検討）
6. コメント書き込み権限は **篠宮のみ**（リーダーや本人は閲覧のみ）

## 未確定（次回検討）

- チームリーダー本人のコメント欄を別途設けるか
- メンバー本人の「振り返りメモ」セクションを追加するか
- AI ドラフト生成の cron 自動化（毎週月曜朝7:00 全メンバー分プリ生成）
- モバイル表示の最適化

## 関連
- 既存合意: `tasks/todo.md` — Analytics/Performance 統合（組織視点側）
- 既存スマートキュー: `src/components/views/smart-queue/`（架電対象抽出はここに完結）
