# AIモデル最適化（2026-07-28）

Spanavi 内で動いている Claude 呼び出しのモデルを、直近1ヶ月の実測利用データに基づいて見直す。

## 背景

本番DB（baiiznjzvzhxwwqzsozn）の実測値。直近30日:

| 機能 | 件数 | 現行モデル |
|---|---:|---|
| 断り理由AI分析 | 933件 | Haiku 4.5 |
| リスト企業のAI企業情報 | 120件 | Haiku 4.5 |
| アポ報告AI添削 | 73件 | Haiku 4.5 |
| 企業ドシエ生成 | 73件 | Sonnet 4.6 |
| アポ傾向分析 | 69件 | Haiku 4.5 |
| スパキャリ議事録 | 45実行 | Sonnet 4.6 |
| 採用AI判定 | 33件 | Haiku 4.5 |
| キックオフヒアリング | 8実行 | Haiku 4.5 |

Claude 費用は月 $18.95。金額が判断を左右する規模ではないため、
「間違えたら誰が困るか」でモデルを選ぶ方針とした。

## やること

- [x] アポ報告AI添削: Haiku 4.5 → **Sonnet 5**（max_tokens 1024→2048）
- [x] 企業ドシエ生成: Sonnet 4.6 → **Sonnet 5**
- [x] スパキャリ議事録: Sonnet 4.6 → **Sonnet 5**
- [x] HP特定(lookup-company-homepage): Sonnet 4.6 → **Haiku 4.5**（格下げ）
- [x] DB検索チャット(chat-to-filter / chat-to-filter-agency): → **Sonnet 5**
- [x] 契約書系(chat-contract-assistant / extract-client-profile-for-contract): → **Sonnet 5**
- [x] スパキャリ課題30問・収益化レポート: → **Sonnet 5**
- [x] AIタブ(AIAssistantView): 旧 Sonnet 4 → **Sonnet 5**
- [x] 全 Sonnet 5 呼び出しに `thinking: { type: 'disabled' }` を追加
- [x] フロントビルド確認（成功）
- [x] Edge Function デプロイ（10本・supabase CLI からディスク直送）
- [x] 本番で動作確認（下記レビュー参照）

## 据え置き（変更しない）

いずれも定型抽出でモデルを上げても出力が変わらないため Haiku 4.5 のまま。

- 断り理由AI分析（933件/月・全AI実行の8割。上げるとコストだけ5倍）
- リスト企業のAI企業情報 / アポ傾向分析 / 採用AI判定 / キックオフヒアリング
- 架電レポート / 文字起こし系 / 担当者音声 / URL抽出 / メール文案

## 保留

- **資本ディールチャット（Spartia Capital）** — Opus 5 に上げたいが
  `deal-chat` `deal-summary-generate` `deal-valuation-auto` `deal-qa-sync`
  `ai-analyze-file` の実装が本リポジトリに存在しない（本番にはデプロイ済み・
  2026年4月以降 version 13 のまま）。案件登録も0件で未稼働のため、
  稼働させるタイミングでソースの所在確認から。

## 重要な注意点（次に触る人向け）

**Sonnet 5 / Opus 5 は `thinking` を指定しないと adaptive（思考ON）になる。**
思考トークンは出力として `max_tokens` を消費するため、未指定のままモデルIDだけ
差し替えると JSON や添削文が途中で切れる。今回は全箇所で明示的に無効化した。
`analyze-spacareer-session` が過去に「結果が空」になったのと同じ壊れ方をする。

**Sonnet 5 はトークナイザが変わり、同じ文章で約30%多くトークンを消費する。**
`analyze-spacareer-session` の cost_usd 計算は通常価格($3/$15)で固定した。
2026-08-31 までは導入価格($2/$10)のため、その期間だけ実費より多めに記録される。

**AIタブ(AIAssistantView) は元から動いていない。**
`api.anthropic.com` を直接叩いているが `x-api-key` を送っていないため401になる。
動かすなら Edge Function 経由に移す必要がある（APIキーをフロントに置かない）。

## 想定コスト

- 現行: $18.95/月
- 移行後: $18.13/月（〜8/31 の導入価格期間）→ $24.75/月（9月以降）
- 非Claude分（Whisper 約$8.4 + Web検索 約$3.4）は変更なし

## レビュー

### デプロイ済み（本番 baiiznjzvzhxwwqzsozn・全て ACTIVE）

appo-ai-report / lookup-company-homepage / chat-to-filter / chat-to-filter-agency /
chat-contract-assistant / extract-client-profile-for-contract /
generate-spacareer-homework30 / generate-spacareer-monetization-report /
generate-company-dossier / analyze-spacareer-session

`supabase functions deploy` でディスクから直接アップロードしたため、
本番の内容はリポジトリとバイト単位で一致する。

### 本番での検証結果

一時関数 tmp-model-check を立てて本番の ANTHROPIC_API_KEY で実測（検証後に削除済み）。

1. **claude-sonnet-5 が使えること** — HTTP 200 / stop_reason=end_turn /
   model_returned=claude-sonnet-5
2. **thinking: disabled が効いていること** — `output_tokens_details.thinking_tokens = 0`
3. **構造化出力(json_schema) + 思考オフの組み合わせ** — 議事録生成と同じ構成で
   JSON.parse 成功・途中切れなし。議事録が過去に起こした「結果が空」は再発しない

Edge Function ログにエラーなし。

### 未実施・持ち越し

- 実データでの品質確認（アポ添削・ドシエ・議事録）は、次に実際の案件が
  流れたときに出力を目視すること。特にアポ添削は短い受付録音のケースを見る。
- 9月以降 Sonnet 5 が通常価格($3/$15)になるとコストが月$24.75前後に上がる。
  導入価格の期間が終わるタイミングで再確認する。
