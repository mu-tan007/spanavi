// スパキャリ 分析レポート モックデータ
//
// 仕様書 §7.7 では「集計は日次バッチ（毎晩0時に集計）」と定義されており、
// クライアント側でリアルタイム集計はしない。日次バッチで集計済みのテーブル
// （未実装。AI機能群＋外部連携エージェントが構築予定）から取得する想定。
//
// 本ファイルは UI 完成のための仮データ。日次バッチ実装後は
// `fetchSpacareerAnalytics(period)` 等の関数に差し替える。

export function getMockKpis(_preset) {
  return {
    // 進捗
    activeCustomers:      42,
    graduatedCustomers:   18,
    cancelledCustomers:    3,
    avgProgressPct:       54.2,

    // 事前課題
    homeworkSubmissionRate: 78.4,
    homeworkOkRate:         62.1,
    homeworkAvgDaysToSubmit: 3.2,

    // セッション
    sessionCompletionRate:  91.5,
    avgSatisfaction:         4.3,   // 5点満点
    noShowRate:              4.1,
    reschedules:            12,

    // 返金保証
    dropoutByThirdSession:   5,
    refundRequests:          1,

    // AI講座
    videoWatchRate:         63.8,

    // クライアントリレーション
    slackDailyContactRate:  87.6,
  };
}

export function getMockTrend(_preset) {
  // 期間内の日次推移（折れ線）
  const days = ['5/12', '5/13', '5/14', '5/15', '5/16', '5/17', '5/18'];
  return days.map((d, i) => ({
    label: d,
    進行中: 40 + i,
    新規: 1 + (i % 3),
    卒業: i % 2 === 0 ? 1 : 0,
  }));
}

export function getMockTrainerCompare() {
  return [
    { label: '山田太郎',   担当顧客数: 8, 平均満足度: 4.6, 完了率: 95 },
    { label: '佐藤花子',   担当顧客数: 7, 平均満足度: 4.4, 完了率: 92 },
    { label: '鈴木一郎',   担当顧客数: 9, 平均満足度: 4.2, 完了率: 88 },
    { label: '田中美咲',   担当顧客数: 6, 平均満足度: 4.5, 完了率: 94 },
    { label: '高橋健太',   担当顧客数: 5, 平均満足度: 4.0, 完了率: 85 },
  ];
}

export function getMockVideoRanking() {
  return [
    { label: '事業計画の作り方',        お気に入り数: 28 },
    { label: 'ピッチデック構成',          お気に入り数: 24 },
    { label: '財務モデル基礎',          お気に入り数: 22 },
    { label: '投資家コミュニケーション', お気に入り数: 19 },
    { label: 'プロダクト検証',          お気に入り数: 16 },
  ];
}

export function getMockSlackHeatmap() {
  // 週×曜日。値は日次連絡実施率（%）
  return {
    rows: ['今週', '先週', '2週前', '3週前'],
    cols: ['月', '火', '水', '木', '金', '土', '日'],
    data: [
      [95, 92, 88, 90, 85, 60, 55],
      [90, 88, 85, 82, 80, 58, 52],
      [85, 82, 80, 78, 75, 50, 48],
      [80, 78, 75, 72, 70, 45, 42],
    ],
  };
}

export function getMockAICost(_preset) {
  return {
    monthly: {
      usageCount: 1842,
      costUsd:    142.85,
      costJpy:    21430,
    },
    byFeature: [
      { label: '議事録生成',        value: 8420 },  // 円
      { label: '30項目生成',        value: 6210 },
      { label: 'フレーズ抽出',      value: 1240 },
      { label: '強み診断',          value: 2880 },
      { label: 'ソーシャルスタイル', value: 1450 },
      { label: '今日のひとこと',    value: 1230 },
    ],
    byCustomer: [
      { label: '山田 太郎',  使用量: 245 },
      { label: '鈴木 花子',  使用量: 198 },
      { label: '佐藤 健',    使用量: 187 },
      { label: '田中 美咲',  使用量: 165 },
      { label: '高橋 一郎',  使用量: 152 },
    ],
    failures: [
      { at: '2026-05-17 22:14', feature: '議事録生成',  customer: '山田 太郎', error: 'rate_limited' },
      { at: '2026-05-16 03:02', feature: '30項目生成',  customer: '佐藤 健',   error: 'context_length_exceeded' },
      { at: '2026-05-15 12:48', feature: 'フレーズ抽出', customer: '田中 美咲', error: 'timeout' },
    ],
    successRate: 98.4,
    totalCalls:  1842,
  };
}
