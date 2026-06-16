// ============================================================
// 「要対応」判定ロジック（§7.1 顧客一覧 / §10.1 要対応アラート）
// ----------------------------------------------------------------
// 4 条件（優先順位は表示順と一致）：
//   1. 未アサイン新規顧客（診断完了済みだが担当トレーナー未設定）
//   2. 事後課題が未通知（セッション完了から1日超過）
//   3. 提出物締切3日前到達（未提出 or 部分提出のまま）
//   4. セッション実施日を過ぎても完了が押されていない
// ============================================================

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * ONE_DAY_MS;

/** 1. 未アサイン新規顧客 */
export function isUnassigned(row) {
  return !!row?.member_id && !row.assigned_trainer_id;
}

/** 2. 事後課題が未通知（直近の完了セッションの事後課題が、完了から1日超過しても通知されていない）
 *  事後課題は「完了した回そのもの」に紐づき、完了時に自動公開される（publishHomework1 /
 *  第2〜7回の自動公開と採番統一）。第0回(キックオフ)は事後課題なし、第8回(卒業)も次課題なし。
 *  ＝ 直近の完了セッションが第1〜8回で、その回の事後課題が存在しない/未通知のまま1日超過した場合のみ要対応。 */
export function isHomeworkUnnotifiedOverdue(row, now = new Date()) {
  const sessions = row?.sessions || [];
  const homework = row?.homework || [];
  const lastCompleted = [...sessions]
    .filter((s) => s.status === 'completed' && s.completed_at)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0];
  if (!lastCompleted) return false;
  const no = lastCompleted.session_no ?? 0;
  // 第0回(キックオフ)は事後課題なし、第8回完了(卒業)も対象外
  if (no < 1 || no > 8) return false;
  const target = homework.find((h) => h.session_no === no);
  if (!target || target.status === 'unnotified') {
    const elapsed = +now - +new Date(lastCompleted.completed_at);
    return elapsed >= ONE_DAY_MS;
  }
  return false;
}

/** 3. 提出物締切3日前到達（未提出 or 部分提出のまま） */
export function isHomeworkNearDeadline(row, now = new Date()) {
  const homework = row?.homework || [];
  return homework.some((h) => {
    if (!h.due_at) return false;
    if (h.status === 'completed' || h.status === 'submitted') return false;
    if (h.status === 'unnotified') return false;
    return +new Date(h.due_at) - +now <= 0;
  });
}

/** 4. セッション実施日を過ぎても完了が押されていない */
export function isSessionOverdue(row, now = new Date()) {
  const sessions = row?.sessions || [];
  return sessions.some((s) => {
    if (!s.scheduled_at) return false;
    if (s.status === 'completed') return false;
    return +new Date(s.scheduled_at) < +now;
  });
}

/** 総合判定 */
export function composeAttention(row, now = new Date()) {
  const codes = [];
  if (isUnassigned(row)) codes.push('unassigned');
  if (isHomeworkUnnotifiedOverdue(row, now)) codes.push('homework_unnotified');
  if (isHomeworkNearDeadline(row, now)) codes.push('homework_near_deadline');
  if (isSessionOverdue(row, now)) codes.push('session_overdue');
  return codes;
}

export const ATTENTION_LABEL = {
  unassigned: '未アサイン',
  homework_unnotified: '事後課題未通知',
  homework_near_deadline: '締切3日前到達',
  session_overdue: 'セッション完了未押下',
};

export const ATTENTION_PRIORITY = {
  unassigned: 1,
  homework_unnotified: 2,
  homework_near_deadline: 3,
  session_overdue: 4,
};

export function topAttentionCode(codes = []) {
  if (!codes.length) return null;
  return [...codes].sort((a, b) => (ATTENTION_PRIORITY[a] || 99) - (ATTENTION_PRIORITY[b] || 99))[0];
}

export { ONE_DAY_MS, THREE_DAYS_MS };
