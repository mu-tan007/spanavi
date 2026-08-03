# Lessons

## 2026-06-18: `git add -A` で無関係な未コミット変更を本番commitに巻き込んだ

### 症状
オートコール修正3ファイルだけをcommitするつもりが、作業ツリーに残っていた別作業（スパキャリのコース分類/動画アップロード/マイグレーション）まで同一commitで本番mainにpushしてしまった。

### 真因
- commit前に `git status` で作業ツリーの状態を確認しなかった
- `git add -A` は対象外の既存変更も全てステージするため、共有repoでは他作業を巻き込む

### ルール（再発防止）
- commit前に必ず `git status` / `git diff --stat` で作業ツリー全体を確認する
- 自分が触ったファイルを**明示的に** `git add <path...>` する。`git add -A` / `git add .` は単独作業と確認済みの時だけ
- 巻き込みに気づいたら黙って進めず、ユーザーに本番反映可否を確認する

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

## 2026-06-03: デモ org のデータが本番 Slack ランキングに合算された

### 症状
デモ org 構築時に `call_records.getter_name='篠宮 拓武'` で 7,150 件投入。
直後の cron 起動で `notify-ranking` が「篠宮 架電150件・キーマン接続150件・アポ取得150件」を本番 Slack に投稿。

### 真因
2つ重なった:
1. **Edge Function `notify-ranking` が org_id でフィルタしていなかった** (全 org の call_records を集計して本物 org の Slack に投稿)
2. **デモデータの getter_name に本物社員名 (`篠宮 拓武`) を入れてしまった** (ListView の manager_name デフォルト挙動と合わせるためだったが、これにより全 org 集計時に本物の篠宮さんの行と合算)

### ルール (自分宛)
1. **マルチ org 環境では、Edge Function の全クエリが特定 org に限定されているかを必ず確認する**。
   `notify-ranking` / `generate-daily-report` / `notify-team-report` / `post-*` 系を一通り見ること。slug ベース (`engagements.slug='seller_sourcing'`) のフィルタは複数 org でヒットするので注意。
2. **デモ/テスト org のテキストフィールド (getter_name / manager_name / contact_person 等) に本物社員名を絶対に入れない**。
   どこかの集計がテキスト一致でやっていれば即混入する。
3. **大規模なデータ投入を行う org を立てたら、cron 起動系の Edge Function を全部 grep して org_id 限定の有無を確認する** ことを構築前のチェックリストに入れる。

## 2026-06-03: アポ二重登録再発 (重複防止 trigger の時間窓が短すぎた)

### 症状
同一クライアント・同一企業・同一アポ日のアポが 2 行登録された。
- row1: 05:25 / sales=0 / item_id=null
- row2: 05:32 / sales=¥220,000 / item_id 付き
- 差 7 分

### 真因
`prevent_duplicate_appointment` trigger の判定窓が `created_at >= now() - interval '5 minutes'`。
ユーザーが 5 分超 (今回 7 分) かけて再操作した場合、ブロックされず重複 INSERT。
過去にも「5分窓では足りない」のサインがあったが、根本対策 (時間窓撤廃) を取らずに「5 分」のままにしていた。

### ルール (自分宛)
1. **アポ重複防止は時間窓に頼らない**。`(list_id, company_name, appointment_date)` の組み合わせで時間制限なくブロックするのが正解。
   別日のリスケや別案件は appointment_date が変わるので別レコードとして許容される。
2. **trigger だけでなく DB UNIQUE constraint** で物理的に1件しか入らないようにする方が更に堅牢
   (今回は trigger 強化のみだが、再々発したら UNIQUE 化を検討)。
3. **時間窓パラメータを修正する時は「もっと長くする」より「設計の不変条件」で考える**。
   「5分」のような魔法の数字は再発の温床。「同じ日の同じ会社のアポは1件」のような事業ルールベースで書く。

## 2026-06-08: 代理ログイン戻し忘れ自動復元が代理ログイン自体を破壊 (1e0a84a → revert)

### 症状
むー様が DealsView から「代理ログイン」ボタンを押すと、新タブが社内 Spanavi 画面 (DealsView の「案件」一覧) に着地し、他の全クライアントが選択肢に出てくる。
クライアントポータルに遷移できない＝代理ログイン機能が完全に死亡。
フラーレン側メンバーからも「ログインできない」と連絡 (auth log では login 200 が 3 回連続 = ログインしてもループしている状態)。

### 真因
コミット `1e0a84a fix(auth): 代理ログイン戻し忘れを自動検知して管理者セッションを復元` で App.jsx に追加した自動復元ロジックが、**代理ログインの新タブ着地時に意図せず発火**していた。

```js
const needRestoreClient = !loading && session && isClientRole && !inClientArea
  && readClientAdminBackup()
```

代理ログイン flow:
1. DealsView で admin session を `spanavi_admin_session_backup` に退避
2. magic link 新タブで開く → `/client` 着地予定
3. しかし「session が admin から client に切り替わる過渡期」+「ClientPortalApp が role 不一致で一瞬 `/` に Navigate する瞬間」に、App.jsx MainApp が描画されて `needRestoreClient` 全条件マッチ
4. → `setSession(admin)` で社内アカウントに「復元」されてしまう → `/dashboard` リロード

つまり「戻し忘れ」を検知するつもりが、「代理ログイン直後の正常な過渡状態」も同じパターンに見える。

### ルール (自分宛)
1. **「localStorage の状態だけで現在のユーザー意図を判定する」設計は、同じ localStorage を使う正常 flow と区別できない**。
   今回は backup 存在 = 戻し忘れと判定したが、代理ログインの新タブも同じ瞬間 backup を持っている。区別するには「backup 保存からの経過時間 (例: > 30 秒)」「現在のタブが magic link 由来か (hash に access_token があるか)」など、**時間・経路の情報を足す**必要がある。
2. **App.jsx の最上位ガードに副作用 (setSession + reload) を仕込むときは、全 auth 経路 (社内 login / クライアント代理ログイン / スパキャリ代理ログイン / magic link / password recovery) で発火条件を机上シミュレートする**。
   一つでも誤発火 flow があると本番が止まる。
3. **小山さん「/dashboard 開くとスパキャリに飛ぶ」のような UX 不都合を直すときは、root cause (新タブ magic link が同一 localStorage を上書きする) に手を入れるべき**。
   - 例: 代理ログインを Supabase クライアントの storage key を別 prefix に切る別 instance で開く
   - 例: 代理ログイン用 URL に `?impersonate=1` を付け、ClientPortalApp 側でその場で `signOut → setSession(impersonatedClient)` する
   症状側で if 文 1 個足すと別経路が壊れる。
4. **代理ログイン経路の変更は本番に出す前に必ず「自分の手でフルに動かす」**。
   今回は元タブで起きる症状 (小山さん問題) しか手で確認していなかったため、新タブ着地経路の副作用に気付かなかった。代理ログイン系の変更チェックリストに「①代理ログインを実行 ②新タブで Deals が描画される ③『社内に戻る』が機能 ④元タブで /dashboard が今までどおり動く」の 4 点を加える。

---

## 2026-06-18 ステータスボタン全停止（自動切電の同期throw）

**症状:** 架電フローでステータスボタンを押しても、ステータス保存も次企業遷移も一切起きなくなった（全停止）。

**根因:** `handleResult` 冒頭に追加した自動切電コードで `normName(...)` を呼んだが、`normName` は同ファイルの `fetchRecordingUrl` 内のローカル定義でスコープ外。`ReferenceError: normName is not defined` が**同期throw**し、以降のステータス保存・遷移処理が全て中断された。

**教訓:**
1. **ハンドラの先頭に処理を差し込む時、参照する関数/変数がそのスコープに実在するか必ず確認する**。同ファイルにある＝スコープ内、ではない（別関数内のローカル定義に注意）。grep で定義行が「どの関数の内側か」まで見る。
2. **付随処理（切電・通知・録音URL取得等）は本体処理を絶対にblockしない**。本体（ステータス保存・遷移）の前に置く副作用は try/catch で隔離する。録音URL取得が「失敗してもステータス保存に影響しない」設計になっていたのと同じ原則を、切電にも最初から適用すべきだった。
3. **本体フローに割り込むコードを足したら、ビルド成功だけでなく「その関数が最後まで走り切るか」を意識する**。ReferenceErrorはビルドを通る。

---

## 2026-06-20 招待/再設定リンクが通常ログイン画面に着地（recovery のハッシュ消失レース）

**症状:** 新メンバー（鷲尾）が招待メール／パスワード再設定リンクを踏むと、パスワード設定画面ではなく通常のログイン画面に遷移。`auth.users` は `confirmed_at`・`last_sign_in_at` が更新済（＝サーバ側ではリンク消費成功）なのに `has_password=false` のまま＝一度もパスワード設定画面に到達できていない。

**根因:** auth-js(2.95.3) は URL ハッシュ `#access_token...&type=recovery` を **Web Locks 取得後に非同期で** 読む(`GoTrueClient._initialize`)。一方この SPA は `main.jsx` で同期描画され、recovery リンク着地先 `/` は即 `App.jsx` の `<Navigate to="/login">` を描画して **ハッシュを消す**。auth-js がハッシュを読む頃にはトークンが消失 → セッション未確立・`PASSWORD_RECOVERY` 未発火 → 通常ログイン画面。invite 側は `isInviteFlow` を**モジュール読込時に同期捕捉**して耐性があったが、**recovery 側には同期捕捉が無く無防備**だった（非対称が真因）。

**対処:** `supabase.js` に `isRecoveryFlow` / `isPasswordSetupFlow` / `isAuthCallbackError` を追加し同期捕捉。`App.jsx` 最上位で、パスワード設定コールバックと分かった時点では `Routes`(=ハッシュを消す Navigate)を一切描画せず、セッション確立まで `AuthCallbackLoader` で待ってから `ResetPasswordPage` を出す。期限切れ着地(`#error=...otp_expired`)は `ExpiredLinkNotice` で案内。

**教訓（自分宛）:**
1. **SPA の `<Navigate>` は URL ハッシュを消す。auth コールバック（access_token/code をハッシュ・クエリで受ける）が着地し得るルートでは、auth-js がトークンを読み終える前に絶対に Navigate させない**。「着地を同期検知 → 確立まで待つ」をルーティングの最優先ガードに置く。
2. **auth-js の URL 処理は同期ではなく Web Locks 後の非同期**。`onAuthStateChange`/`getSession` のイベント頼みは、レンダー側がハッシュを消すと負ける。確実な着地検知は `window.location.hash` をモジュール読込時に同期で読む（`isInviteFlow` 方式）。
3. **invite で効いている同期捕捉ガードは recovery/magiclink にも横展開する**。片方だけ守ると非対称バグになる。auth 経路を足したら全 type（invite/recovery/magiclink/error）で着地挙動を机上シミュレートする（lessons #2026-06-08 と同じ原則）。

## 2026-07-22 スパキャリ新タブ(revenue)追加で「開いた瞬間に顧客一覧へ戻る」

**症状**: 新タブのボタンを押すと一瞬で既定ページ(customers)へリダイレクト。
**根因**: SpanaviApp.jsx には事業ごとに**ハードコードされたタブ許可リストが複数箇所**あり、`CAREER_TABS`(遷移ガード, 事業切替時に `!includes(currentTab)` で既定へ戻す)に新キーを入れ忘れた。
**教訓（自分宛）**: スパキャリ/ソーシングに新タブを足すときは、以下を**全て**更新する。1つでも漏れると無言でリダイレクトされる:
1. `src/constants/pageRegistry.js`（権限UIのマスタ）
2. `SpacareerAdminSidebar.jsx` の `ACTIVE_IDS` ＋ セクション定義
3. `SpanaviApp.jsx` の描画分岐（`currentTab === 'xxx'`）
4. `SpanaviApp.jsx` の **`CAREER_TABS` 遷移ガード配列**（← 今回漏れた。事業切替useEffect内）
5. `SpanaviApp.jsx` の canViewPage 既定タブ解決配列（line ~762）
6. `SpanaviApp.jsx` の キーボード循環 `tabs` 配列（line ~823）
7. `EngagementComingSoon` の除外配列（line ~1397 の `!includes` リスト）
8. DB: `member_page_permissions` シード（非admin公開時。admin限定ならバイパスで不要）
grep 一発点検: `grep -n "'templates','analytics'" src/components/SpanaviApp.jsx` で全リストを洗い出してから足す。

## 2026-07-23 追記: 新タブのハードリロードで既定ページに戻る
上記(2026-07-22)のタブ許可リストには **もう1箇所** あった: `SpanaviApp.jsx` の `_VALID_TABS`
（currentTab を localStorage から復元する際の検証リスト, line ~405）。ここに新keyが無いと
**ハードリロード時**に保存済みタブが無効判定され既定(customers)へ戻る。
→ 新タブ追加チェックリストに「_VALID_TABS」を追加。CAREER_TABS=クリック遷移、_VALID_TABS=リロードの2系統。
