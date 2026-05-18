// スパキャリ 事前課題管理 mockデータ
// 基盤構築（ステップ2）完了までのプレースホルダ。Supabase接続後はAPI差替え。
// 仕様書: tasks/spacareer-spec.md §7.3 事前課題管理

// セッションは第0〜第8回。第0回は事前課題なし。事前課題は第1〜第8回前の8サイクル。
export const HOMEWORK_STATUSES = [
  { key: 'unsent',     label: '未通知',   variant: 'danger',  cellColor: '#FBE7EA' },
  { key: 'sent',       label: '通知済み', variant: 'info',    cellColor: '#DDECF8' },
  { key: 'unstarted',  label: '未提出',   variant: 'warn',    cellColor: '#FFF1DD' },
  { key: 'partial',    label: '部分提出', variant: 'warn',    cellColor: '#FFE0BD' },
  { key: 'submitted',  label: '提出済み', variant: 'success', cellColor: '#D6EFDF' },
  { key: 'completed',  label: '完了',     variant: 'success', cellColor: '#9FD3B0' },
];

export const STATUS_INDEX = HOMEWORK_STATUSES.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

export const MOCK_CUSTOMERS = [
  { id: 'c001', name: '山田 太郎',   trainer: '佐藤 美咲', currentSession: 3 },
  { id: 'c002', name: '鈴木 花子',   trainer: '田中 健司', currentSession: 5 },
  { id: 'c003', name: '高橋 一郎',   trainer: '佐藤 美咲', currentSession: 2 },
  { id: 'c004', name: '伊藤 さくら', trainer: '田中 健司', currentSession: 7 },
  { id: 'c005', name: '渡辺 慎也',   trainer: '佐藤 美咲', currentSession: 1 },
  { id: 'c006', name: '中村 由美',   trainer: '小林 直人', currentSession: 4 },
  { id: 'c007', name: '小林 翔',     trainer: '小林 直人', currentSession: 6 },
  { id: 'c008', name: '加藤 真理',   trainer: '田中 健司', currentSession: 8 },
];

// 顧客×第1〜8回の状態マトリクス
// 未進行は null
export const MOCK_MATRIX = {
  c001: { 1: 'completed', 2: 'completed', 3: 'unsent',    4: null,        5: null,        6: null,        7: null,        8: null },
  c002: { 1: 'completed', 2: 'completed', 3: 'completed', 4: 'completed', 5: 'partial',   6: null,        7: null,        8: null },
  c003: { 1: 'completed', 2: 'submitted', 3: null,        4: null,        5: null,        6: null,        7: null,        8: null },
  c004: { 1: 'completed', 2: 'completed', 3: 'completed', 4: 'completed', 5: 'completed', 6: 'completed', 7: 'sent',      8: null },
  c005: { 1: 'unstarted', 2: null,        3: null,        4: null,        5: null,        6: null,        7: null,        8: null },
  c006: { 1: 'completed', 2: 'completed', 3: 'completed', 4: 'unsent',    5: null,        6: null,        7: null,        8: null },
  c007: { 1: 'completed', 2: 'completed', 3: 'completed', 4: 'completed', 5: 'completed', 6: 'partial',   7: null,        8: null },
  c008: { 1: 'completed', 2: 'completed', 3: 'completed', 4: 'completed', 5: 'completed', 6: 'completed', 7: 'completed', 8: 'submitted' },
};

// 「未通知の顧客」専用リスト（セッション完了から1日以内に通知が必要）
export const MOCK_UNSENT = [
  {
    customerId: 'c001', name: '山田 太郎', sessionNumber: 3, sessionDate: '2026-05-15',
    elapsedDays: 3, trainer: '佐藤 美咲', dueByDate: '2026-05-16',
  },
  {
    customerId: 'c006', name: '中村 由美', sessionNumber: 4, sessionDate: '2026-05-16',
    elapsedDays: 2, trainer: '小林 直人', dueByDate: '2026-05-17',
  },
];

// 課題テンプレートタブ用ダミー（テンプレ管理画面と整合）
export const MOCK_HOMEWORK_TEMPLATES = [
  { key: 'homework_1',     label: '第1回事前課題（共通）',    updatedAt: '2026-04-22', updatedBy: '佐藤 美咲', itemCount: 18 },
  { key: 'homework_base',  label: '第2〜8回事前課題ベース項目', updatedAt: '2026-05-01', updatedBy: '運営',     itemCount: 12 },
  { key: 'ai_prompt',      label: 'AIプロンプト（30項目生成）', updatedAt: '2026-05-08', updatedBy: '運営',     adminOnly: true },
  { key: 'ok_criteria',    label: 'OK判定基準',               updatedAt: '2026-04-15', updatedBy: '佐藤 美咲', itemCount: 8 },
];

// 個別顧客の30項目編集データ（mock）
export function buildDraftItems(customerId, sessionNumber) {
  const TOPICS = [
    '今週の振り返り', '達成できたこと', '感じた壁', '次に挑戦したい行動',
    '影響を受けた人', '本当に伝えたい価値観', 'キャリアの軸', '直近1年で得たい状態',
    '苦手な状況の構造化', '理想の働き方', '理想の人間関係', '感謝を伝えたい相手',
    '今のスキル棚卸し', '将来必要なスキル', '読みたい/読んだ書籍', '尊敬する人の共通点',
    '直近の成功体験', '直近の失敗体験', 'お金以外の報酬', '譲れない条件',
    'やりたくないこと', '5年後の自分', '3年後の自分', '半年後の自分',
    '今の自分への手紙', '家族への気持ち', '健康習慣', '時間配分の理想',
    '直近の意思決定', '感情のメモ',
  ];
  return TOPICS.map((title, idx) => ({
    id: `${customerId}_${sessionNumber}_${idx + 1}`,
    order: idx + 1,
    title,
    body: `第${sessionNumber}回セッションを踏まえ、${title}について書いてください。`,
    required: idx < 25,
    category: idx < 10 ? '振り返り' : idx < 20 ? '価値観' : '行動計画',
  }));
}

export function kpiSummary() {
  const all = Object.values(MOCK_MATRIX);
  let unsent = 0, sent = 0, total = 0, dueSoon = 0;
  all.forEach(row => {
    Object.values(row).forEach(v => {
      if (!v) return;
      total += 1;
      if (v === 'unsent') unsent += 1;
      if (v === 'sent' || v === 'unstarted' || v === 'partial') sent += 1;
      if (v === 'partial' || v === 'unstarted') dueSoon += 1;
    });
  });
  return {
    unsentCount: unsent,
    dueSoonCount: dueSoon,
    customerCount: MOCK_CUSTOMERS.length,
    notifiedCount: sent,
  };
}
