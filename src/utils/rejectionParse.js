// キーマン断り温度感ラベル＋メモ抽出ユーティリティ
//
// call_records.rejection_reason の先頭に AI 判定の温度感プレフィックス
// （"HIGH\n..." / "MEDIUM\n..." / "LOW\n..."）が入っているため、
// 抽出ロジック・Badge 表示仕様を共通化する。
//
// 利用箇所:
//  - smart-queue/KeymanRejectionsPanel.jsx（一次実装元）
//  - CompanySearchView.jsx の録音一覧サブタブ
//
// 既存の Badge 仕様は変えない（色・ラベル・variant 値）。

export const TEMP_BADGE = {
  HIGH:      { variant: 'success', label: '温度感: 高' },
  MEDIUM:    { variant: 'info',    label: '温度感: 中' },
  LOW:       { variant: 'danger',  label: '温度感: 低' },
  UNCERTAIN: { variant: 'neutral', label: '判定困難' },
};

// rejection_reason 文字列の先頭から温度感コード（HIGH/MEDIUM/LOW）を抽出。
// 該当しない場合は null を返す（呼び出し側で UNCERTAIN にフォールバック）。
export function extractTemp(text) {
  if (!text) return null;
  const m = text.match(/^(HIGH|MEDIUM|LOW)/i);
  return m ? m[1].toUpperCase() : null;
}

// rejection_reason 文字列の先頭プレフィックスを除去してメモ本文だけを返す。
// 例: "HIGH\n御本人多忙のため..." → "御本人多忙のため..."
export function stripTempPrefix(text) {
  if (!text) return '';
  return text.replace(/^(HIGH|MEDIUM|LOW)\s*\n?/, '').trim();
}
