# 設計：スパキャリ営業の流れ（送信→返信→面談予約→面談結果→成約→入金）

論点：リードの主キー・ソース間の照合の鍵・テーブル構成・担当者の帰属を決める。
（2026-10-01 Fable 5.1。呼び出し前の設計ファイルが無かったので、ここで起こした）

## 実データで分かったこと（2026-10-01 実測）

| 項目 | 値 | 出どころ |
|---|---|---|
| `cw_sent_workers_global` 行数 | 72,736 | SQL |
| うち worker_id の種類 | 72,736（**worker_id に一意索引あり**） | `idx_cw_sent_workers_unique` |
| 複数ライセンスから送られたワーカー | **0人** | SQL。「複数の営業マンから送られる」という前提は誤り。前回の表の重なりは名前の部分一致によるもの |
| 同じ表示名を持つ別 worker_id | 15名（72,736人中） | SQL。名前の完全一致で照合してもほぼ衝突しない |
| 直近7日の送信の記録 | 5,951 | SQL（失敗分を含む） |
| Slack投稿（獲得40＋商談登録60）のワーカー名 | 100件中、空欄は0件・種類は87 | Slack実物 |
| 87名のうち送信の記録と**完全一致** | 55（63%）・一致先はすべて1人に決まる | SQL |
| 空白と大文字小文字をそろえた一致で追加 | 1 | SQL |
| 一致しない32名 | 本名で書かれたもの（緒方崇・佐野弘達など）／「pppyoon(舟口さん)」のような注記付き／応募・複業クラウドなどスカウト以外の経路 | Slack実物 |
| 営業マンが `members` にいるか | 石井・鍛冶だけ。**平山・鈴木早紀・田中・野堀はいない** | SQL |
| `members` にSlackのIDを持つ列 | 無い | SQL |
| `spacareer_customers` | 18件（開始以来の累計） | SQL |

## 決めたこと

1. リードの主キーは **uuid の代理キー**にする。CWの worker_id を主キーにはしない（スカウト以外の経路が約3割あり、あとから主キーを替えると、イベント表と画面の両方を作り直すことになるため）。
2. `cw_worker_id` はリードの**任意の列**にして、NULLでない値だけに一意索引をつける（1ワーカー＝1リード）。
3. **送信はリードにしない。** 72,736件を複製せず、送信数は `cw_sent_workers_global` からその都度数える。リードができるのは「返信」か「面談獲得」が起きたときから。
4. 照合の順番は **① ボットが読んだ返信の worker_id（確定）→ ② ワーカー名の完全一致（空白・大文字小文字をそろえる）で1人に決まれば自動で確定 → ③ 0人か2人以上なら「未照合」として残し、人が選ぶ**。どの方法で結びついたかを `match_method` に残す。
5. 構成は **リード1行＋段階イベントの追記型**にする。リスケでの予約し直しや面談の複数回は、段階ごとの列を持つ横持ちの形では表せないため。今の段階はビューで出す。
6. Slack投稿は**原文を保存**して、`(channel_id, ts)` を一意の鍵にする。これで取り込みを何度やり直しても重複しない。読み取りの規則を直したら、Slackから取り直さずに原文から読み直す。
7. 担当者は **`spacareer_sales_reps` という専用の表**で持つ（表示名・Slack ID・`member_id` は任意）。営業マンの半分が `members` にいないので、`members` を外部キーにはしない。`cw_licenses` に `rep_id` を足して、送信者を担当者に結びつける。
8. 担当者は**イベントごと**に持つ（送信＝ライセンスの持ち主、獲得＝獲得者、面談＝担当アポインター、クロージング＝クローザー）。リードには固定の担当者を持たせない。
9. 成約イベントには、`appointer_rep_id` と `closer_rep_id` を**その時点の値で書き込む**。報酬の20:80の配分と件数制の計算は、あとからこの2列を読むだけで済むようにする。
10. 送信失敗は `cw_sent_workers_global` に `status`（sent/failed、過去分はNULL＝不明）と `fail_reason` を足して記録する。別の表は作らない。**failed のワーカーは重複よけの対象から外し、もう一度送れるようにする**（リストが減り続ける不具合を止める）。
11. 成約→入金は、成約のときに **人が `spacareer_customer_id` を1回だけ結びつける**。件数は累計18件と少なく、メールアドレスはSlack投稿に無いので、自動にしない。入金は `spacareer_invoices` から、結びついた受講生を経由してたどる。

## 表の形（案）

- `spacareer_sales_reps`(id uuid PK, display_name, slack_user_id unique, member_id null, active)
- `cw_licenses` に `rep_id uuid null` を追加
- `cw_sent_workers_global` に `status text null`, `fail_reason text null` を追加
- `spacareer_sales_leads`(id uuid PK, cw_worker_id text null ※NULL以外で一意, display_name, source 'cw_scout'|'cw_apply'|'fukugyo'|'other'|'unknown', match_method 'reply'|'exact_name'|'manual'|'none', spacareer_customer_id null, created_at)
- `spacareer_sales_events`(id, lead_id null ※未照合の間はNULL, kind 'replied'|'booked'|'meeting'|'rebooked'|'closed'|'lost', occurred_at, rep_id null, result text, appointer_rep_id null, closer_rep_id null, recording_url, source 'slack'|'cw_bot'|'manual', source_ref unique, raw jsonb)
- `spacareer_sales_slack_raw`(channel_id, ts, PK(channel_id,ts), user_id, text, fetched_at)
- ビュー `spacareer_sales_funnel_v`：担当者×週ごとの 送信→返信→獲得→面談実施→成約→入金

## やらないこと（今回は先回りしない）

- TimeRexとの連携と、鍛冶さんのカレンダーの取り込み。Slackの獲得報告に初回日程があるので足りる。予約漏れの突き合わせが要るとわかってから足す。
- 報酬の自動計算の画面。形だけは耐えるようにしておく（決めたこと9）。
- 過去の送信記録（status がNULLの分）の成功・失敗の復元。
- 名前のあいまい一致（部分一致・読みの揺れ）。部分一致は前回、別人を拾った実績がある。

## 答え合わせ（実装後に測るもの）

- 直近2週間のSlack獲得報告のうち、リードに結びついた割合が **63%以上**（名前だけの今の値）で、返信の取り込みが動いてからさらに上がること。
- 自動で確定した照合を20件抜き出して人が見て、別人が **0件**であること。
- `spacareer_sales_events.source_ref` の重複が0件で、取り込みを2回流しても行数が変わらないこと。
- v3.3配布後、`status='failed'` の行が出てきて、そのワーカーに再送が起きていること。
- 画面の週別の獲得数が、Slackの獲得報告を手で数えた数と一致すること（前回の40件の内訳：石井12・平山11・鈴木11・鍛冶6）。

## 実装の順番（Opus 向け）

1. マイグレーション：reps／leads／events／slack_raw の各表、cw_licenses.rep_id、cw_sent_workers_global.status。reps に平山・石井・鈴木（趙のライセンス）・鍛冶・田中・野堀の6人を入れる。
2. Edge Function `spacareer-sales-slack-sync`（pg_cronで15分ごと）：2チャンネルの履歴を読む→原文を保存→読み取り→イベントにする→名前で照合。**先に SLACK_BOT_TOKEN の権限（groups:history）と、2つの非公開チャンネルに参加しているかを確かめる。**
3. 画面：スパキャリ → ANALYTICS に「営業ファネル」を足す（担当者×週／未照合の一覧で人が選ぶ／リードの時系列と録画リンク）。
4. ボットv3.3：送信結果（status）の報告と、CWのメッセージ一覧から返信を読んで報告する。**CWの画面の構造はまだ見ていないので、ログイン済みの画面で実物を確かめてから作る。** 管理サーバー側の受け口と重複よけの条件も直す。配布は v3.2 と同じ手順。
5. 答え合わせの5項目を測る。

## むー様に決めてもらうこと

- なし。ボットがCWのメッセージ一覧を読みに行くのは、今も同じアカウントで画面を操作しているのと同じ種類の動作。ただし、CW側でアカウントが止められる危険が少し増える点は、v3.3を配布する前に一言伝える。
