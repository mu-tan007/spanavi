# 設計：フォーム営業の資料閲覧計測（2026-09-28・Fable）

## 論点
M&Aクライアント開拓リストへのフォーム営業で、会社ごとのリンクから資料（売り手ソーシング代行 PDF）が開かれたことを記録し、開かれた瞬間に Slack #contact へ知らせる。Renga様ギフトDMの計測（gift_*）に相乗りするか、別に持つか。

## 決めたこと
- **表はギフトDMと分ける。** 新設 `doc_sends`（送付1件＝1行）と `doc_view_events`（閲覧1回＝1行）、集計はビュー `doc_send_stats` 1本。gift_* には一切触らない。
- `doc_sends` の主キーは uuid、公開の鍵は `token`（8桁 `[0-9a-f]`・一意）。一意制約はもう1本 `(campaign, lead_item_id)`。
- 送付先は必ず `lead_item_id`（call_list_items.id）で架電リストに紐付ける（not null）。社名・電話は送付時点のスナップショットとして持つ。
- `channel`（'form' | 'email'）と `sent_to`（フォームURLかメールアドレス）は記録用。トークンは会社に1本で、経路ごとには分けない。
- `sent_at` が null の行は「リンク発行済み・未送付」。送った時点で埋める（タブの行ごとの操作で埋める）。
- 公開URLは **`https://spanavi.jp/d/<token>`**（/g/ はギフトDM専用のまま）。資料自体に「自社システムSpanavi」と書いてあるので、ドメインと資料の話が食い違わない。
- 公開ページ `/d/:token` は開いた瞬間に記録を送り（keepalive）、そのまま PDF へ遷移する。間にボタンを挟まない。
- PDF は Spanavi の `public/docs/spartia-uri-sourcing.pdf` に置く（Renga の `/renga/company-profile.pdf` と同じ置き方）。
- 記録は新しい Edge Function `doc-view`（verify_jwt=false・常に204・実在トークンだけ記録）。gift-scan は流用しない。
- **通知は doc-view の中で同期に打つ。** 人の閲覧（is_bot=false）を記録した直後に `update doc_sends set view_notified_at=now() where id=$1 and view_notified_at is null returning id` を投げ、1行取れたときだけ Slack へ送る。この原子的な取り合いで二重通知を防ぐ。
- Slack が失敗したら `view_notified_at` を null に戻す（次の閲覧で再送される）。cron は置かない。
- 通知は **1社1回（初回閲覧）**。2回目以降の閲覧はタブと架電画面の回数で見る。
- 宛先は `org_settings.slack_webhook_contact`。値は Spartia サイトの問い合わせフォームが #contact に投稿している incoming webhook と同じもの（masp-site-v2 は Vercel に SLACK_WEBHOOK_URL が無くフォールバック値で #contact に届いている）。
- 案件ページのタブは `doc_sends` に行があるクライアントだけ出す（giftdm と同じデータ駆動）。ラベル「フォーム営業」、位置は「再アプローチ候補」の右。
- 架電画面（CallFlowView）は選択中の企業に `doc_send_stats.first_view_at` があれば「資料閲覧済み（初回日時・計N回）」を出す。
- クライアントポータル（ClientPortalApp）には出さない。今回のクライアントは自社（M&Aソーシングパートナーズ＝Spartia）で、ポータルで見る人がいない。
- 画面の呼び方は「閲覧」。「開封」は使わない。

## 実データで分かったこと

| 項目 | 値 |
|---|---|
| gift_shipments の行 | 208（すべて campaign=renga_20260918、client=Renga） |
| gift_qr_events | 6件。Renga の計測は稼働中 |
| gift_shipments を読んでいる箇所 | 6（gift-scan／notify-gift-scan／DealsView タブ判定／ClientPortalApp タブ判定／CallFlowView 手紙タブ／GiftDmTab・Charts 経由のビュー） |
| notify-gift-scan の拾い方 | org 全体を campaign で絞らずに拾い、文言は「Renga Partners様のギフト同梱DM」固定 |
| 対象リスト | call_lists 8e2e1846…、client_id 51af9005…（M&Aソーシングパートナーズ株式会社 - M&A） |
| 送付対象 | 366社（フォーム351・メールのみ15）、全社 call_list_items.id あり |
| 資料 | 10頁・3.2MB・Spartia名義・「自社システムSpanavi」の記載あり |
| /g/sample | spanavi.jp で 200（公開ルートは動いている） |

**相乗りしない理由（数字）**：gift_shipments に行を足すと、6箇所のうち少なくとも4箇所（notify・DealsView判定・ClientPortal判定・CallFlowView手紙タブ）に経路の絞り込みを足す必要がある。1箇所でも漏れると、稼働中の notify-gift-scan が「Renga Partners様のギフト同梱DM」の文言で #dorayaki-ai にフォーム営業の会社を流す。分ければ既存の変更は0箇所、作り直しになりうる表は新設の2本だけ。

## やらないこと
- ギフトDMと共通の「送付」基盤への統合（3本目の施策が出てから考える）
- 閲覧ページの計測以上の機能（ページ別の滞在時間、PDFの何ページまで読んだか）
- 2回目以降の閲覧の通知、遅延通知、cron
- スマートキューへの優先度反映（架電画面の目印まで）
- メール開封の計測（ピクセル）

## 答え合わせ
- 本番で検査用トークンを1本作り、`/d/<token>` を実機ブラウザで開く → PDF が表示される／`doc_view_events` に is_bot=false が1行／#contact に1本だけ届く。
- 同じトークンを再度開く → events は2行、Slack は増えない。
- `curl` で `/d/<token>` を叩く → SPA なので記録されない（JSを実行しない取得は数えない）。Edge を curl で直接叩いた場合は is_bot=true で通知なし。
- Renga 側：`gift_shipment_stats` の件数・`notify-gift-scan` の実行結果が変更前後で同じ（208件・sent 0）。
- 検査行は消す（Slack の検査通知1本は残る旨をむー様へ伝える）。

## 実装の順番（Opus 向け）
1. マイグレーション：`doc_sends` / `doc_view_events` / ビュー `doc_send_stats`（gift_shipment_stats の形を写す：first/last_view_at・view_count・最新架電）/ RLS は gift_* を丸写し / `org_settings.slack_webhook_contact` 登録
2. Edge Function `doc-view`（gift-scan を土台に、原子的な通知の取り合いを追加）→ デプロイ → curl で1件検証
3. PDF を `public/docs/` に置き、`/d/:token` ルートと `DocLanding.jsx`（記録→PDFへ `location.replace`）
4. DealsView に「フォーム営業」タブ（`DocSendsTab.jsx`：集計カード＋表・閲覧済み未架電を上に・行ごとに「送付済み」操作）
5. CallFlowView に「資料閲覧済み」の目印
6. 366社分の `doc_sends` を投入（Excel の経路・送付先を入れる、sent_at は null）→ Excel に「送付用URL」列を足して出し直す
7. 本番 push → 答え合わせの手順を実機で通す

## むー様に決めてもらうこと
- なし（通知は1社1回で始める。2回目以降も欲しければ後から足せる）
