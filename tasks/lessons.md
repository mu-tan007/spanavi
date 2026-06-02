# Lessons

## 2026-05-20: Edge Function deploy 漏れで「AI出力フィールドの一部だけ空」障害

### 症状
アポ取得報告のAI自動生成で「先方のお人柄」項目だけ空になり、他の項目（面談経験/将来検討/その他）は正常に出る。

### 真因
- リモートの main では `temperature` → `personality` への field 改名 + プロンプト刷新が完了済み
- だが Supabase 本番の `transcribe-recording` Edge Function は古いdeploy版（v30, `temperature` 入出力）のまま放置
- 結果として：
  - フロントは `personality` を送り `data.personality` を読む
  - Edge は `temperature` を受けて `temperature` を返す
  - 名前ミスマッチで personality だけ空に。他の field は名前一致のため動作

### ルール（自分宛）
1. **「コードを書いた／pushした」と「本番稼働している」は別物**。Edge Function は明示 deploy が必須。CI で自動 deploy が走っていない限り、`supabase functions deploy <name>` か MCP `deploy_edge_function` を回す。
2. **field 名を rename したら必ず deploy 直後に１件流して検証**。フロントと Edge の I/F 不整合は静かに壊れる（HTTPステータスは200のまま、特定 field が空になるだけ）。
3. **「grep で見つからない」だけで「未実装」と即断しない**。`git fetch && git log --all -S "<keyword>"` でリモート/全branch履歴を確認してから判断する。今回ローカルが古かったため誤った前提で重複リネーム作業を始めかけた。
4. **rebase で複数 conflict が出たら一旦 abort して状況を読む**。「マージしてくれ」と自動で解決しようとせず、相手側が何をしているか先に把握する。今回はリモートの方が遥かに高度な実装で、僕の変更を merge していたら新仕様を破壊していた。

## 2026-06-02: 契約書 reward_table の出力で報酬体系パターンを後手で塞いだ

### 症状
formatRewardTable の修正が出るたびにユーザーから「別パターンも変だ」とフィードバックを受け続けた。
- M&A 売上高連動 → 「売上高がN円未満の会社：X万円」に対応
- 件数連動 (株式会社がんば) → 「アポ件数が1円以上4円未満の会社：1.5万円」と金額用 fmtJpYen を通してしまった
- 固定報酬 (M&A Lead 10万円) → 「-が10000.0億円未満の会社：10万円」と basis=「-」、hi=巨大値を素直に展開してしまった

### 真因
reward_types マスタには少なくとも3パターンある:
1. **金額連動** (売上高/当期純利益/営業利益 等): basis=金額の種類、tier の lo/hi/price は円
2. **件数連動** (アポ件数 等): basis=「アポ件数」、tier の lo/hi は件数、price は単価
3. **固定報酬**: basis 空 or「-」「固定」、tier 1つ、lo=null/0、hi=巨大値、price=固定額

最初に1だけ実装してしまい、新パターンが出るたびに分岐を後付け。

### ルール (自分宛)
1. **報酬体系を扱う時は必ず3パターン (固定/件数連動/金額連動) を最初から想定する**。lo/hi/price/basis の組み合わせで「これは何パターン？」を分岐してから整形する。
2. **新しい型を見たら、まず reward_types マスタを覗いて basis の値分布を確認する**。`select distinct basis from reward_types` のような事前確認を怠らない。
3. **fmtJpYen のような汎用整形関数は、basis が金額型と確定した時のみ使う**。件数/件名/固定はそれぞれ別整形。

## 2026-06-03: ハンドラを「親関数の closure」に作って子関数で呼んで ReferenceError

### 症状
ハードリロードで画面が真っ青のまま動かない。コンソールに
`Uncaught ReferenceError: handleClientNameClick is not defined`

### 真因
事業俯瞰のクライアント名リンク化で `handleClientNameClick` を
**`BusinessOverviewView` 直下** で定義したが、実際に渡す対象の `ListAnalysisTable` は
**`SectionListAnalysis` という別の関数コンポーネント** の中で呼ばれていた。
JSX のスコープ判定は親関数の closure を継承しない (Reactコンポーネントの境界で切れる) ため、
子コンポーネントからは「未定義」となって render 中に throw。
ビルド時には検出できない (実行時に到達して初めて crash する) ため、ハードリロードで一発全滅。

### ルール (自分宛)
1. **ハンドラ/値を JSX に渡す前に、その JSX を `return` している関数 (コンポーネント) と同じ closure で定義されているか必ず確認する**。
   1ファイルに複数コンポーネントが定義されている時 (Section系) は特に注意。
2. **「props で渡す」が正解。親関数で作って子関数で参照、は React では成立しない**。
3. **Hooks (useMemo/useCallback) を依存配列ごと書いて満足しない**。
   そのフックが**どの関数の中にいるか**で利用可能スコープが決まる。
4. **大きい変更を push する前に、開発サーバ (`npm run dev`) で1回ハードリロードして確認する**。
   ビルド成功=動作保証ではない。今回は build OK でも runtime で crash した。
