# スクリプトPDFの取込とプレビュー（2026-09-15）

## 背景

むー様のご要望：スクリプトページでPDFをインポートし、集中モードのスクリプトタブでプレビューできるようにする。

2026-04-21 に一度作り、2026-06-11 のツリー型導入時（コミット `b629cbb`「スクリプトPDF廃止」）にUIだけ外した経緯がある。
**DB・バケット・書込関数は生きたまま残っている**ので、足すのはUIだけ。

| 既存資産 | 場所 |
|---|---|
| `call_lists.script_pdfs` jsonb（`[{path,name,size,uploaded_at}]`） | `supabase/migrations/20260421000000_add_script_pdfs_to_call_lists.sql:6` |
| `script-pdfs` バケット（private・20MB・application/pdfのみ・SELECT許可済） | 同 `:11-32` |
| `uploadScriptPdf` / `deleteScriptPdfObject` / `updateCallListScriptPdfs` / `getScriptPdfSignedUrl` | `src/lib/supabaseWrite.js:2442-2487` |
| アプリstateへの読み込み（`scriptPdfs`） | `src/hooks/useSpanaviData.jsx:180` |
| 見せ方の前例（企業概要PDF・iframe＋署名付きURL） | `CallFlowView.jsx:2773-2828`、モーダルは `:3001-3020` |
| 取込UIの前例 | `ListView.jsx:1155-1250` |

マイグレーションは不要。

## やること

- [x] 1. `ScriptView.jsx` 全画面エディタの右パネルにPDF取込を戻す
  - [x] アップロード／削除／プレビュー（ドラッグ&ドロップ対応）
  - [x] 右パネルはこれまでテキスト型のときだけ出していた。PDFはツリー型でも要るので、ツリー型のときはPDFだけの細いパネルにする
- [x] 2. `CallFlowView.jsx` 集中モードのスクリプトタブでプレビュー
  - [x] 表示切替を「ガイド／全文／PDF」の3つにし、持っているものだけ出す
  - [x] PDFは企業概要タブと同じ iframe ＋ 署名付きURL
  - [x] list mode の下部パネル（120px）は狭いので、企業概要と同じくボタン→モーダル
- [x] 3. `ListScriptDrawer.jsx`（案件／クライアントポータル）を集中モードと同じ見え方に揃える
  - [x] `CallResultsTab.jsx` の `select` に `script_pdfs` を足す
- [x] 4. ビルドを通す
- [x] 5. 画面で確かめる
- [x] 6. main へ push

## 決めたこと

- PDFの紐づけ先は `call_lists`（案件＝架電リスト）単位。文章スクリプトと同じ単位なので設計の岐路はない
- 文章とPDFは併存。置き換えない
- 新しいライブラリは入れない。ブラウザ内蔵のPDFビューアを iframe で使う既存方式を踏襲する

## 確認待ち

- 2026-06に一度外した理由。使われていなかっただけなら問題ないが、不都合があったのなら避けて作る（むー様へ確認中）

## レビュー

**変更したファイル（4つ・マイグレーションなし）**

- `src/components/views/ScriptView.jsx` — 全画面エディタの右パネルに「添付PDF」を新設。D&D枠・一覧・サイズ表示・削除・プレビューのモーダル。右パネルはこれまでテキスト型でしか出していなかったが、PDFは型に関係なく要るので常時表示に変え、ツリー型のときは幅300pxでPDFだけを出す（テキスト型は従来どおり400px＋アウト返し）
- `src/components/views/CallFlowView.jsx` — スクリプトの表示切替を `scriptModes` で組み立て、持っているものだけ「ガイド／全文／PDF」を並べる。`effectiveScriptMode` を置いて、持っていないモードを指したままにならないようにした（例: ツリーを消した直後）。集中モードはiframeで直接プレビュー、list modeの下部パネル（120px）はボタン→既存のPDFモーダル
- `src/components/views/deals/ListScriptDrawer.jsx` — 同じ3モードに。PDFはドロワーの高さいっぱいに出す
- `src/components/views/deals/CallResultsTab.jsx` — `select` に `script_pdfs` を足し、`getScript` の「閲覧可」判定にPDFを含めた

**画面で確かめたこと（localhost:3000・株式会社LST プラスチック成型で検証し、検証用PDFは削除済み）**

1. スクリプトページ: ツリー型でも右パネルにPDF枠が出る／テキスト型では アウト返し＋PDF の2段
2. 取込: 382.7KBのPDFをD&Dで投入 → 一覧に出る → クリックでモーダルに実物が描画される
3. 集中モード: 切替が「ガイド／PDF」（このリストは本文が空なので「全文」は出ない＝仕様どおり）。PDFタブでそのまま読める
4. 案件ドロワー: 同じ切替・同じ見え方。**最初は480px固定で下に700px余っていたので `height:100%` に直した**
5. 削除: 一覧から消え「未添付」に戻る。Storageのオブジェクトも削除される
6. コンソールにエラーなし／`npx vite build` が通る

**気づき**

- `script_pdfs` は2026-04に作って6月にUIだけ外したもの。列・バケット・書込関数・`useSpanaviData` の読み込みまで全部生きていたので、足したのはUIだけで済んだ
