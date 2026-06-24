// ============================================================
// スパキャリ セッション日程ヘルパー（受講生ポータル表示用）
// ----------------------------------------------------------------
// むー様指示 2026-06-24:
//   キックオフ管理では第1回の開始日時のみ入力する。第2〜8回は
//   「第1回と同じ曜日・時刻で毎週」自動仮置きして受講生に表示する。
//   ただし管理者が各回の実日時を確定（scheduled_at）した場合はそれを優先する。
// ============================================================

/**
 * 第1回基準で第N回の毎週仮置き日時を算出する。
 * 第1回 + 7日 ×(sessionNo - 1)。曜日・時刻は第1回と完全一致する。
 * @param {Date|string|number} session1At 第1回の開始日時
 * @param {number} sessionNo 1〜8
 * @returns {Date|null}
 */
export function weeklyProvisionalDate(session1At, sessionNo) {
  if (!session1At || !sessionNo || sessionNo < 1) return null;
  const base = new Date(session1At);
  if (isNaN(base.getTime())) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + 7 * (sessionNo - 1));
  return d;
}

/**
 * セッションの表示用日時を解決する（確定優先＋毎週自動仮置き）。
 *  - scheduled_at が確定済みならそれを使う（provisional=false）
 *  - 未確定かつ第2回以降なら第1回基準で毎週仮置き（provisional=true）
 *  - それ以外は null
 * @param {{ session_no:number, scheduled_at?:string|null }} session
 * @param {Date|string|number|null} session1At 第1回の開始日時
 * @returns {{ date: Date, provisional: boolean } | null}
 */
export function resolveSessionSchedule(session, session1At) {
  if (!session) return null;
  if (session.scheduled_at) {
    const d = new Date(session.scheduled_at);
    if (!isNaN(d.getTime())) return { date: d, provisional: false };
  }
  if ((session.session_no ?? 0) >= 2) {
    const d = weeklyProvisionalDate(session1At, session.session_no);
    if (d) return { date: d, provisional: true };
  }
  return null;
}

/**
 * セッション配列から第1回の開始日時を取り出す。
 * @param {Array<{session_no:number, scheduled_at?:string|null}>} sessions
 * @returns {Date|null}
 */
export function getSession1At(sessions) {
  const s1 = (sessions || []).find((s) => s.session_no === 1);
  if (!s1?.scheduled_at) return null;
  const d = new Date(s1.scheduled_at);
  return isNaN(d.getTime()) ? null : d;
}
