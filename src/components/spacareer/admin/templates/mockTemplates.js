// スパキャリ テンプレート管理 mockデータ
// 仕様書: §7.6 テンプレート管理

// 11種類のテンプレート（機能別4タブで分類）
export const TEMPLATE_CATEGORIES = [
  { key: 'homework',     label: '事前課題' },
  { key: 'session',      label: 'セッション' },
  { key: 'diagnosis',    label: '診断' },
  { key: 'notification', label: '通知' },
];

// type: text(本文編集) / items(項目リスト) / prompt(AIプロンプト) / notification(通知文+変数)
export const TEMPLATES = [
  // ── 事前課題タブ ────────────────────────────
  {
    key: 'homework_1',
    category: 'homework',
    label: '第1回事前課題（共通）',
    description: 'キックオフ完了時に自動配布される第1回事前課題テンプレート',
    adminOnly: false,
    type: 'items',
    enabled: true,
    updatedAt: '2026-04-22 14:32',
    updatedBy: '佐藤 美咲',
    body:
`1. これまでの人生を振り返って、最も影響を受けた出来事を教えてください
2. 今回のスパキャリで絶対に手に入れたいものを教えてください
3. お金以外で本当に達成したい価値観は何ですか
4. 尊敬している人物とその理由を教えてください
5. 半年後、1年後、3年後の理想の自分を描写してください`,
  },
  {
    key: 'homework_base',
    category: 'homework',
    label: '第2〜8回事前課題ベース項目',
    description: 'AI生成時の共通土台となる項目（残り30項目はAIが補完）',
    adminOnly: false,
    type: 'items',
    enabled: true,
    updatedAt: '2026-05-01 09:14',
    updatedBy: '運営',
    body:
`1. 前回セッションからの振り返り（達成・気づき・課題）
2. 次回までに取り組むアクション3つ
3. 自分への問い`,
  },
  {
    key: 'ai_prompt',
    category: 'homework',
    label: 'AIプロンプト（30項目生成）',
    description: 'AI事前課題30項目生成時に Claude へ渡すプロンプト本文',
    adminOnly: true,
    type: 'prompt',
    enabled: true,
    updatedAt: '2026-05-08 18:20',
    updatedBy: '運営',
    body:
`あなたはキャリアコーチングの経験豊富なトレーナーです。
受講生 {顧客名} の第{セッション番号}回事前課題として、以下の情報を踏まえ、
30個の問いを生成してください。

【入力】
- 直近のセッション議事録：{議事録}
- ヒアリングシート：{ヒアリングシート}
- 過去事前課題の回答：{過去回答}
- ソーシャルスタイル診断結果：{診断結果}
- 強み診断結果：{強み診断}

【出力ルール】
- 30項目を「振り返り→価値観→行動計画」の順に並べる
- 25項目を必須、5項目を任意とする
- 各項目は title と body を持つ`,
  },
  {
    key: 'ok_criteria',
    category: 'homework',
    label: 'OK判定基準',
    description: 'トレーナーが事前課題をOK判定する際の運用基準',
    adminOnly: false,
    type: 'text',
    enabled: true,
    updatedAt: '2026-04-15 11:00',
    updatedBy: '佐藤 美咲',
    body:
`■ 必須要件
- 全項目が空欄でないこと
- 「振り返り」項目は具体的な事実が含まれていること
- 「行動計画」項目は期日と行動内容が明示されていること

■ 差し戻し基準
- 「分からない」「考え中」のみで内容が伴わない場合
- 質問の意図と明らかに乖離している場合`,
  },

  // ── セッションタブ ────────────────────────────
  {
    key: 'kickoff_hearing',
    category: 'session',
    label: 'キックオフヒアリングシート',
    description: '第0回キックオフ時に口頭確認する4.3.1〜4.3.9 の全項目',
    adminOnly: true,
    type: 'items',
    enabled: true,
    updatedAt: '2026-04-10 16:00',
    updatedBy: '運営',
    body:
`4.3.1 現職での課題感
4.3.2 これまでのキャリア（時系列）
4.3.3 大切にしている価値観
4.3.4 半年後・1年後・3年後の理想像
4.3.5 直案件DBへの興味度
4.3.6 必要となるスキル
4.3.7 家族・パートナーとの合意状況
4.3.8 経済的な制約
4.3.9 質問・不安事項`,
  },
  {
    key: 'session_feedback',
    category: 'session',
    label: 'セッション感想アンケート',
    description: 'セッション後に受講生に送付する満足度アンケート',
    adminOnly: false,
    type: 'items',
    enabled: true,
    updatedAt: '2026-04-28 13:45',
    updatedBy: '田中 健司',
    body:
`Q1. 本日のセッションの満足度（5段階）
Q2. 今日得た最大の気づき（自由記述・必須）
Q3. 次回セッションまでに取り組みたいこと（任意）
Q4. トレーナーへのフィードバック（任意）`,
  },

  // ── 診断タブ ────────────────────────────
  {
    key: 'social_style_questions',
    category: 'diagnosis',
    label: 'ソーシャルスタイル診断質問項目',
    description: '30問の診断質問項目マスター',
    adminOnly: true,
    type: 'items',
    enabled: true,
    updatedAt: '2026-03-30 10:00',
    updatedBy: '運営',
    body: '（30問の本文。Claude が論文・公表データに基づき作成。実装フェーズで詳細投入）',
  },
  {
    key: 'social_style_descriptions',
    category: 'diagnosis',
    label: '各タイプの説明テキスト',
    description: '論理分析型／行動推進型／感情表現型／協調共感型 の特徴と接し方ポイント',
    adminOnly: true,
    type: 'text',
    enabled: true,
    updatedAt: '2026-03-30 10:00',
    updatedBy: '運営',
    body:
`【論理分析型】
特徴：データと論理を重視。慎重に判断する。
接し方ポイント（運営内部のみ）：根拠を示して進める。感情訴求は控えめに。

【行動推進型】
特徴：意思決定が速く、結果志向。
接し方ポイント：要点を端的に。雑談は短く。

【感情表現型】
特徴：人間関係と感情を重視。表現豊か。
接し方ポイント：共感を示してから本題に入る。

【協調共感型】
特徴：周囲との調和を重視。決断に時間がかかることも。
接し方ポイント：安心感のあるトーンで合意形成を重ねる。`,
  },

  // ── 通知タブ ────────────────────────────
  {
    key: 'notify_unstarted',
    category: 'notification',
    label: '事前課題未着手リマインド',
    description: '締切3日前に未着手の顧客に Slack 送信される通知文',
    adminOnly: false,
    type: 'notification',
    enabled: true,
    updatedAt: '2026-04-05 09:00',
    updatedBy: '田中 健司',
    body:
`{顧客名}様

第{セッション番号}回前の事前課題がまだ未着手のようです。
締切は {締切日} です。

回答はこちら：{ポータルURL}

ご不明点があれば本チャンネルでお気軽にどうぞ。
担当：{担当トレーナー}`,
  },
  {
    key: 'notify_due',
    category: 'notification',
    label: '締切リマインド',
    description: '締切当日に部分提出/未提出の顧客に送信',
    adminOnly: false,
    type: 'notification',
    enabled: true,
    updatedAt: '2026-04-05 09:00',
    updatedBy: '田中 健司',
    body:
`{顧客名}様

本日が第{セッション番号}回前事前課題の締切日です。
セッション（{セッション日時}）をより有意義にするため、
できる範囲でご回答をお願いいたします。

ポータル：{ポータルURL}
担当：{担当トレーナー}`,
  },
  {
    key: 'notify_published',
    category: 'notification',
    label: 'クライアントポータル反映通知',
    description: '「完了・通知」押下時にSlackへ自動送信される告知文',
    adminOnly: false,
    type: 'notification',
    enabled: true,
    updatedAt: '2026-04-05 09:00',
    updatedBy: '田中 健司',
    body:
`{顧客名}様

第{セッション番号}回前の事前課題をクライアントポータルに公開しました。
締切：{締切日}
回答URL：{ポータルURL}

担当：{担当トレーナー}
何かご不明な点があればご連絡ください。`,
  },
];

// 変更履歴（mock）
export const TEMPLATE_HISTORY = [
  { id: 'h001', templateKey: 'ai_prompt',          at: '2026-05-08 18:20', by: '運営',     summary: '振り返り→価値観→行動計画の順を明示' },
  { id: 'h002', templateKey: 'homework_base',      at: '2026-05-01 09:14', by: '運営',     summary: '土台項目を5→3に削減' },
  { id: 'h003', templateKey: 'session_feedback',   at: '2026-04-28 13:45', by: '田中 健司', summary: 'Q4トレーナーフィードバック追加' },
  { id: 'h004', templateKey: 'homework_1',         at: '2026-04-22 14:32', by: '佐藤 美咲', summary: '尊敬する人物の理由を必須化' },
  { id: 'h005', templateKey: 'ok_criteria',        at: '2026-04-15 11:00', by: '佐藤 美咲', summary: '差し戻し基準を明文化' },
  { id: 'h006', templateKey: 'kickoff_hearing',    at: '2026-04-10 16:00', by: '運営',     summary: '初版' },
  { id: 'h007', templateKey: 'notify_unstarted',   at: '2026-04-05 09:00', by: '田中 健司', summary: '初版' },
];

// 通知テンプレで利用可能な変数（仕様書 §7.6）
export const NOTIFICATION_VARIABLES = [
  { token: '{顧客名}',         hint: '受講生の氏名' },
  { token: '{セッション番号}', hint: '第◯回（1〜8）' },
  { token: '{セッション日時}', hint: 'YYYY-MM-DD HH:mm' },
  { token: '{締切日}',         hint: '事前課題の提出期限' },
  { token: '{担当トレーナー}', hint: '担当コーチ氏名' },
  { token: '{ポータルURL}',    hint: 'クライアントポータル該当ページ' },
];
