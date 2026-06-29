# スパキャリ AI議事録／顧客一覧／Zoom録画リンク 改修（2026-06-29）

## 背景（むー様指示）
1. AI議事録生成で「AI 議事録の結果が空でした。再分析してください」が出る → 改善
2. AI議事録生成中にページ移動しても生成が止まらないようにする（アップロードは既に裏側継続）
3. 顧客一覧で各受講生の氏名の下に担当トレーナー氏名を表示（管理画面のみ。クライアントポータルは不要）
4. 動画アップロード時にZoom共有リンクを添付し、各回ごとに管理画面で視聴できるように（視聴リンクのみ。AI議事録は従来どおりファイルから）

## 実装タスク

### Feature 1: AI議事録の空エラー改善（Edge Function）
- [ ] `supabase/functions/analyze-spacareer-session/index.ts`
  - Claude呼び出しを切り出し、assistant prefill `{` でJSON強制
  - ```json コードフェンス除去＋堅牢なJSON抽出
  - parse失敗 or 空内容なら1回だけ自動リトライ
  - `MINUTES_MAX_TOKENS` を 8192→16000 に引き上げ（長尺セッション出力truncate対策）
  - usageはリトライ分も合算
- [ ] 本番Supabaseにdeploy＋1件検証

### Feature 2: ページ移動でも生成継続
- [ ] `CustomerDetail/index.jsx`
  - `loading || !detail` 早期returnで `SessionJobsProvider` ごとアンマウントが原因
  - Providerを常時マウントし中身(inner)だけ出し分けるよう再構成

### Feature 3: 顧客一覧にトレーナー氏名表示（管理画面のみ）
- [ ] `CustomerListColumn.jsx` CustomerCard に「担当: ○○」を氏名下に小さく表示

### Feature 4: Zoom録画リンク（視聴のみ・各回管理）
- [ ] migration: `spacareer_sessions` に `recording_url text` 追加
- [ ] `TabSessionManage.jsx` 動画カードに「Zoom録画リンク」入力＋「録画を開く」（即時autosave）
- [ ] `TabKickoff.jsx` にも同様
- [ ] `TabSessionHistory.jsx` 各回一覧に録画リンク表示

## 検証
- [ ] `npm run build`
- [ ] Edge Function deploy後に実セッションで1件確認
- [ ] 顧客一覧トレーナー名 / Zoomリンク開く 動作確認
- [ ] main で commit & push

## Review
（実装後に記載）
