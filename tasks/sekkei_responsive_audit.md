# 設計：スパナビ全ページ・全タブのレスポンシブ監査と修正（2026-09-26・Fable）

むー様指示：「視聴状況以外でも、スパナビの全ページ・全タブを見た上で、レスポンシブ対応がなされていない箇所があれば徹底的に直す」

## 決めたこと

- 「対応済み」の定義を目視ではなく**数値**にする。幅390pxで読み込んだとき、次の3つがすべて0なら合格。
  1. ページ全体の横はみ出し（`documentElement.scrollWidth − clientWidth`）が0
  2. 画面右端を越える要素が0（ただし `overflow-x: auto|scroll` の箱の中にある要素は除く。横スクロールは設計上の許容）
  3. 開いたモーダル・ドロワーの幅が画面幅以下
- 監査は**Chromeの中でスクリプトで測る**。むー様のログイン済みタブに、幅390pxの`iframe`で各ページを読み込み、上の3つを機械的に採点する。目で見て回らない。
  - `?viewport=mobile` は JS の `useIsMobile()` しか切り替えない（メディアクエリが効かない）。**iframe を実際に390pxにすると CSS も JS も両方スマホになる**（本日 `/library` で動作確認済み）。だからこの方法を採る。
- 対象は **pageRegistry の30ページ＋各ページのサブタブ＋主要モーダル**。監査の入口は `src/constants/pageRegistry.js`（営業代行17・スパキャリ管理13）。ここに無い画面は対象にしない。
- 直し方は「同じ型が3ファイル以上に出るものは土台（`index.css` のクラス／`DataTable`／共通部品）で直す。1〜2ファイルだけの崩れはそのファイルで直す」。今日 `DataTable` の `minWidth` に余白35pxを足した修正がその型の例（全表に効く）。
- 修正後に**同じスクリプトをもう一度流し、全行0になったらむー様に渡す**。むー様には実機スクショを頼まず、こちらが採点表を出す。実機で見てもらうのは、むー様がよく使う5画面だけ（ダッシュボード・架電リスト・企業検索・アポ一覧・アナリティクス）。

## 実データで分かったこと

| 項目 | 数字 | 出どころ |
|---|---|---|
| 前回のスマホ全面改修 | 2026-08-15 | `tasks/mobile_overhaul_2026-08-15.md`、記憶 `reference_spanavi_mobile` |
| その後のコミット | 137件 | `git log --since=2026-08-16` |
| その後に増えたコンポーネント | 24ファイル | 同上 `--diff-filter=A` |
| うちスマホ対応の痕跡（useIsMobile／spa-2col／spa-kpi-grid／DataTable／spa-scroll-x）が無いもの | 7ファイル | grep |
| 固定幅グリッド（`repeat(n,1fr)` や `320px 1fr`）を持ち、スマホ対応の痕跡が無い行 | Capital配下のタブ（Financials/Valuation/PMI/LBO/DD/Contracts/ExecutiveSnapshot）、PayrollSelfDetail、PayrollInvoiceGenerator、ClientMyPage、DailyReportPanel、EmailCampaignConsole、Rejection/Dossier/AppointmentsTab、CRM系4、Spacareer系4 | grep（`gridTemplateColumns`） |
| 600px以上の固定幅（`width`/`minWidth`） | StatsView・ShiftManagement・BusinessOverview・capital/DealsPage 各2、ほか10ファイル各1 | grep |
| 生の `<table>` を使うファイル | 30ファイル（BusinessOverview 6・CallFlow 3・EngagementSettings 3 …） | grep（PDF系 InvoicePDF/MemberInvoicePDF は印刷用なので除外） |
| `position: fixed` の独自モーダル | CRM系だけで10ファイル | grep |
| views 直下でスマホ対応の痕跡が無いファイル | 30ファイル（うち PDF・PlaceholderView・Banner は除外対象） | grep -L |
| 既存の土台 | `index.css` の `@media (max-width:767px)`：`.spa-2col` `.spa-kpi-grid` `.spa-scroll-x`、入力16px、ボタン44px／`DataTable` は768px未満でカード化 | `src/index.css` 128行〜 |

**読み**：8/15の改修は「その時点のページ」を直したもの。以後6週間で137コミット入り、新しい画面と表が土台を使わずに増えた。崩れの大半はこの「新しく足した分」と、8/15に手が回らなかった生の `<table>`・Capital・CRMのモーダルにある。

## やらないこと

- 印刷用（InvoicePDF・MemberInvoicePDF・ClientReportPDF）はスマホ対応しない
- 受講生ポータル（`/spacareer/*`）と顧客ポータル（`/client/*`）は今回の「スパナビ全ページ」に含めない（別ログイン。むー様の判断待ち＝下記）
- 横スクロールを禁止しない。列の多い表・ヒートマップ・月間シフトは `spa-scroll-x` の中で横に流す（8/15に決めた方針のまま）
- 見た目の好み（余白・色・並び）には触らない。数値で「はみ出し」と判定できるものだけ直す

## 答え合わせ（実装後に何を測るか）

1. 監査スクリプトを再実行し、**pageRegistry 30ページ × 全サブタブ × 主要モーダル** の全行で「横はみ出し0／越境要素0／モーダル幅≤390」
2. `git diff --stat` で触ったファイルが「監査で赤が出たファイル」と一致する（先回りで他を触っていない）
3. PC幅（1280px）で同じスクリプトを流し、**赤が増えていない**（スマホの修正でPCを壊していない）
4. むー様の実機で5画面のスクショ

## 実装の順番（Opus 向け）

1. **ページ一覧を作る** `tasks/responsive_pages.json`
   - `pageRegistry.js` の30キーを URL に変換（`SpanaviApp.jsx` の `activeTab` ↔ pathname の対応を読んで確定。`/library` `/dashboard` `/deals` が既にそのまま効いている）
   - 各ページのサブタブを列挙する。URL持ちは `useUrlState` の許可リスト（`search_subtab` `tab` `recall_subtab` `chartTab` `month` `sq_main` `cp_tab`）。URLを持たないタブは各Viewの `{ id, label }` 配列から拾う（AdminView 6・DealsView・CustomerDetail 8・RecallList 2 など）。**ボタンの文字列で押す**ので label を記録する
   - 主要モーダルは「一覧の1行目を押す」「＋追加」「編集」の3操作で開くものに限る（CRM系10ファイルの独自モーダルが主な対象）
2. **監査スクリプトを書く** `tasks/responsive_audit.js`（Chromeの `javascript_tool` で流す前提。ログイン済みタブで実行）
   - 本体ページの `body` を退避し、`iframe` 390×800 を作って各URLを順に読み込む（same-origin なので `contentDocument` に触れる。本日 `/library` で実証済み）
   - 読み込み後 3秒待ち → タブがあれば label のボタンを押して 1秒待ち → 採点 → 次へ
   - 採点は上の3項目。越境要素は「`getBoundingClientRect().right > 392` で、祖先に `overflow-x: auto|scroll` が無い」もの。**要素の tagName・className・先頭20字・親の階層** を記録して、どのファイルか追えるようにする
   - 結果を JSON で `window.__audit` に貯め、`JSON.stringify` で吐く（大きいので分割して取り出す）
   - 終わったら `location.reload()` で本体を戻す
3. **1回目を流して赤の一覧を `tasks/sekkei_responsive_audit.md` の末尾に表で追記**（ページ／タブ／症状／要素／推定ファイル）。ここまでは**コードを1行も直さない**
4. **型で分けて直す**
   - 3ファイル以上に出る型 → 土台。想定される追加：`.spa-table-x`（生 `<table>` を `display:block; overflow-x:auto` にする包み）、`.spa-modal`（`position:fixed` の独自モーダルに `max-width: calc(100vw − 32px)` と `inset` の下限）、`.spa-grid-auto`（`repeat(n,1fr)` を `auto-fit, minmax(160px,1fr)` に）
   - 1〜2ファイルの崩れ → そのファイルで `spa-2col` / `spa-kpi-grid` / `useIsMobile` を当てる
   - 表は **可能なら `DataTable` に置き換える**（規約）。ただし BusinessOverview のように集計の複雑な表は `spa-table-x` で横スクロールにとどめる
5. **2回目を流す**（スマホ390とPC1280の両方）→ 全行0を確認 → push（自動デプロイ）→ 本番でもう一度流す
6. 監査結果の表と `git diff --stat` をむー様に見せる。「見た目で気になる所」はこの後で個別に受ける

## むー様に決めてもらうこと

1. **受講生ポータル（`/spacareer/*`）と顧客ポータル（`/client/*`）も「全ページ」に含めますか。** 別ログインなので、含めるなら代理ログイン（既存機能）で入って同じスクリプトを流します。含めない前提で先に本体30ページを進めます。
2. **Capital（`/deals` `/documents` `/partners` など、pageRegistry に無い画面）は対象に入れますか。** サイドバーからは出ていないため、いまは対象外にしています。

---
（以下、Opus が監査結果を追記する）

## 実施結果（2026-09-26・Opus）

採点方法の修正：`<main>` に `overflow-x:hidden` があり、はみ出しが「見えないだけ」になっていた。
画面の9割以上の幅の箱で切れている要素は、はみ出しとして数えるよう採点を直してから流した。

| 範囲 | 画面数 | 見つかったはみ出し | 直し方 | 再採点 |
|---|---|---|---|---|
| 営業代行（サブタブ込み） | 18ページ・約45画面 | 全ページの見出し（PageHeader が -28px で main の 12px を打ち消しすぎ）／報酬の月タブ・操作ボタン／企業DBの見出し右ボタン／権限管理の460px固定2列 | PageHeader（スマホは -12px・右側を折り返し）／各ファイル | 0 |
| スパキャリ管理（サブタブ込み） | 12ページ | 見出しのみ（上と同じ） | 同上 | 0 |
| 受講生ポータル | 7画面 | **スマホ用レイアウトが丸ごと無かった**（220px の左メニュー常時表示）／2列画面4つ／下部固定バーが left:220 | ☰ドロワー化・`spa-2col`・固定バーを全幅 | 0 |
| 顧客ポータル | 2画面 | ヘッダー（会社名とボタン）・タブ5つ | コードで修正（代理ログインは管理画面のログインを上書きするため実機採点はしない） | — |
| Capital | — | -28px の全幅化（見出しと同じ） | 修正のみ。このアカウントの事業切替に Capital が無く画面で開けない | — |
| モーダル | 16個 | 固定幅 400〜700px で上限なし | `maxWidth: calc(100vw - 24px)` | — |

土台の改善：`.spa-2col` を `minmax(0,1fr)` に（長い文字列で列が画面より広がるのを防ぐ）。
