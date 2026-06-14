// アナリティクスの「当社売上」をアポ一覧ページと完全に一致させるための期間判定。
// アポ一覧は「面談実施日(meetDate)が選択期間に含まれる」かつ
// status が面談済/事前確認済/アポ取得、isProspecting除外、で売上を合計している。
// 月モードのときは「その月の面談日すべて（未来の面談予定も含む・月末まで）」が対象。

export const SALES_STATUSES = ['面談済', '事前確認済', 'アポ取得'];

// 面談実施日(meetDate 'YYYY-MM-DD')が、選択期間に含まれるか。
// period='month' のときは monthStr(YYYY-MM) の月全体で判定（range.toが今日でも月末まで拾う）。
export function meetDateInPeriod(meetDate, period, range, monthStr) {
  if (!meetDate) return false;
  const d = meetDate.slice(0, 10);
  if (period === 'month' && monthStr) return d.slice(0, 7) === monthStr;
  return d >= range.from && d <= range.to;
}

// アポが売上計上対象か（ステータス＋クライアント開拓除外＋期間）
export function isSalesAppo(a, period, range, monthStr) {
  return SALES_STATUSES.includes(a.status)
    && !a.isProspecting
    && meetDateInPeriod(a.meetDate, period, range, monthStr);
}
