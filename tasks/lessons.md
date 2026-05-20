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
