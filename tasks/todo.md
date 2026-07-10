# スパキャリ 改修計画（2026-07-10）

対象: スパナビ スパキャリタブ。本番=main。UIはデザイントークン/共通UI厳守。

## 決定済み仕様（むー様確認済）
- 応用コースは α1〜α8 の固定8本。session_no には紐づかない独立連番。
- 表示順: 加入回 J 以降、各基本回の後にαを1つ interleave。基本回(第8回)が尽きたら残りαを連続表示。
  - 例) J=3: …第2回, 第3回→α1, 第4回→α2, 第5回→α3, 第6回→α4, 第7回→α5, 第8回→α6, α7, α8
  - 例) J=5: …第4回, 第5回→α1, 第6回→α2, 第7回→α3, 第8回→α4, α5, α6, α7, α8
  - 例) J=1(最初から応用): 第1回→α1 … 第8回→α8
- 過去回(J未満)にはα/(2)を作らない=虫食い解消。ラベルは「第N回(2)」廃止→「プラスアルファN」。
- 企業DB(直案件DB)は営業ポータル DatabaseView を受講生画面に流用。第4回完了で解禁。
- コース変更権限は篠宮/小山のみ。直案件権限付与は「第4回完了(v_max>=4)」に変更。

---

## 作業1: 応用コースのセッション表記モデル刷新（α連番）
- [ ] migration: `spacareer_customers.oyo_start_session_no smallint`（J）追加
- [ ] α行の意味変更: part=2 / session_no=α連番(1..8)。既存oyo顧客データを移行
- [ ] `fn_spacareer_set_course` 改修: →oyo時 J=clamp(current_session_no+1,1,8) を記録し α1..8(not_started)を用意（過去回穴埋め廃止）。→kyoka時 未完了α削除
- [ ] `fn_spacareer_create_customer_sessions` 改修: oyo新規は α1..8生成 / J=1
- [ ] `fn_spacareer_recalc_progress` / `fn_spacareer_reset_next_up`: interleave順でnext_up、進捗分母は動的維持
- [ ] 共通ヘルパー `orderOyoSessions(sessions, J)` を追加（並び順を一元化）
- [ ] ラベル修正: part===2 → `プラスアルファ{session_no}`（ProgressStepper / TabSessionManage / TabSessionHistory / ClientHistoryView / index.jsx）
- [ ] index.jsx タブ出現ゲートを新並び順の「直前完了」基準に（虫食い解消を検証）
- [ ] useCustomers select に `oyo_start_session_no` 追加

## 作業2: コース・プラン変更権限を篠宮・小山のみに
- [ ] `permissions.js` に `SPACAREER_COURSE_CHANGE_EMAILS = [shinomiya, koyama]`
- [ ] RightSidebar CourseCard: 対象外ユーザーは変更ボタン非表示/無効
- [ ] `fn_spacareer_set_course` にサーバー側ガード（対象外は例外）

## 作業3: 直案件DB閲覧権限を第4回完了で付与
- [ ] `fn_spacareer_recalc_progress` の `direct_db_access_granted_at` 条件を v_max>=3 → v_max>=4

## 作業4: 企業DB(直案件)を受講生に流用＋ソート
- 方針: 営業代行 DatabaseView 本体は無変更。useCompanySearch を流用し、受講生専用の新画面 `SpacareerCompanyDbView` を作る。共通部品には列差し替え等のprop（デフォルト現状維持）を追加のみ。
- RLS: company_master は cm_select_auth=authenticated USING(true) で受講生も既に閲覧可 → **RLS変更不要**。
- [ ] SpacareerClientApp メニューに企業DB追加（direct_db_access_granted_at 有り時のみ表示）
- [ ] 受講生用カラム(8列): 企業名 / 業種(industry_sub) / 事業内容 / 都道府県 / 住所 / 売上高(千円,丸め) / 代表者 / 電話番号
- [ ] 売上高は上1桁四捨五入で表示（例 469,000→500,000）。ソート/フィルタは真値、表示のみ丸め
- [ ] ソート: 業種・売上高・企業名・都道府県。フィルタ: 企業名/事業内容検索・業種・都道府県・売上高範囲・電話番号
- [ ] CSVエクスポート=可(8列・売上は丸め値)。AIチャット/インポート/アップロード=非表示

## 作業5: 顧客一覧に金色「応用コース」ラベル
- [ ] useCustomers select に `course` 追加
- [ ] CustomerCard（CustomerListColumn.jsx 氏名横）に金色 pill 表示（course==='oyo'）

## 作業6: 締め切り3日前ロジック点検・修正
- [ ] `needAttention.js` isHomeworkNearDeadline のバグ修正: `due-now <= 0`(締切超過) → `due-now <= 3日`(3日前以降)
- [ ] ClientHomeworkView の72h警告・キックオフ3日前計算を再点検（問題なければ現状維持）

## 検証
- [ ] `npm run build` 通過 / money.js等既存テスト
- [ ] migration をSupabase本番に適用し1件で動作確認
- [ ] 途中加入oyo顧客で虫食いが出ないこと、α順序、進捗/卒業、権限、ラベル位置を目視
- [ ] main へ commit & push（feedback_auto_push / feedback_spanavi_main_branch 準拠）

## レビュー（2026-07-10 実装完了）
- 作業1: 共通ヘルパー `src/lib/spacareer/sessionOrder.js` で並び順(J interleave)・ラベル(プラスアルファN)を一元化。
  migration `20260710120000_spacareer_alpha_sessions.sql` で J列追加・RPC/トリガー刷新・既存2名を移行。
  本番適用済。既存oyo 2名は J=3 に設定され next_up がα1→第3回へ是正、虫食い解消を確認。
  UI反映: ProgressStepper / index.jsx タブ / TabSessionManage / TabSessionHistory / ClientHistoryView /
  横断3画面(SpacareerSessionsView[プラスアルファタブ追加] / TrainerScheduleView / SessionRecordsView)。
- 作業2: permissions.js `canChangeCourse` + RightSidebar CourseCard ボタン制御 + RPCサーバーガード(篠宮/小山)。
- 作業3: recalc_progress の直案件解禁を v_max>=4(第4回完了/基本回基準)に変更。
- 作業4: 受講生用 `SpacareerCompanyDbView`(useCompanySearch流用/読取専用/8列/売上上1桁丸め/ソート/CSV)。
  第4回完了(direct_db_access_granted_at)でメニュー表示。営業代行DatabaseView・RLSは無変更。
- 作業5: useCustomers に course 追加 + CustomerCard 氏名横に金色「応用コース」pill。
- 作業6: needAttention.js のバグ修正(締切3日前判定 `<=0` → `<= THREE_DAYS_MS`)。
- 検証: `npm run build` 成功（既存warningのみ）。本番migration適用+実データ確認済。
