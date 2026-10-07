// メンバーページの「いまの状態」と今月の数（2026-10-07 むー様確認の見本どおり）

const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const hhmm = (t) => String(t || '').slice(0, 5).replace(/^0/, '');

/** 日本時間の今日 'YYYY-MM-DD' と、いまの分（0時から） */
export function nowJst(now = new Date()) {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const [h, m] = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Tokyo', hour12: false }).split(':').map(Number);
  return { date, min: h * 60 + m };
}

/** 今月1日0時（日本時間）の ISO */
export function monthStartIso(now = new Date()) {
  const d = nowJst(now).date;
  return new Date(`${d.slice(0, 7)}-01T00:00:00+09:00`).toISOString();
}

export const CALLING_WINDOW_MIN = 30;

/**
 * いまの状態。架電中（直近30分に架電）→ シフト中 → 次のシフト → シフトなし の順に見る
 * shifts はこの人の今日以降のシフト（shift_date, start_time, end_time）
 */
export function memberStatus({ lastCalledAt, shifts = [] }, now = new Date()) {
  const { date, min } = nowJst(now);
  if (lastCalledAt && now.getTime() - new Date(lastCalledAt).getTime() <= CALLING_WINDOW_MIN * 60000) return { kind: 'calling', label: '架電中' };
  const today = shifts.filter(s => s.shift_date === date);
  const cur = today.find(s => toMin(s.start_time) <= min && toMin(s.end_time) > min);
  if (cur) return { kind: 'shift', label: `シフト中 〜${hhmm(cur.end_time)}` };
  const next = shifts
    .filter(s => s.shift_date > date || (s.shift_date === date && toMin(s.start_time) > min))
    .sort((a, b) => (a.shift_date + a.start_time).localeCompare(b.shift_date + b.start_time))[0];
  if (next) {
    const [, mo, d] = next.shift_date.split('-').map(Number);
    return { kind: 'next', label: next.shift_date === date ? `今日 ${hhmm(next.start_time)}〜` : `次 ${mo}/${d} ${hhmm(next.start_time)}〜` };
  }
  return { kind: 'none', label: 'シフトなし' };
}

/** 上の段の数字 */
export function memberKpis({ members, stats, shifts, appos }, now = new Date()) {
  const { date } = nowJst(now);
  const names = new Set(members.map(m => m.name));
  const own = stats.filter(s => names.has(s.getter_name));
  const calling = own.filter(s => s.last_called_at && now.getTime() - new Date(s.last_called_at).getTime() <= CALLING_WINDOW_MIN * 60000).map(s => s.getter_name);
  const ids = new Set(members.map(m => m.id));
  const todayShifts = shifts.filter(s => s.shift_date === date && ids.has(s.member_id));
  const hours = todayShifts.reduce((t, s) => t + Math.max(0, toMin(s.end_time) - toMin(s.start_time)) / 60, 0);
  const calls = own.reduce((t, s) => t + Number(s.calls), 0);
  const keyman = own.reduce((t, s) => t + Number(s.keyman), 0);
  const ownAppos = appos.filter(a => names.has(a.getter_name));
  return {
    calling,
    shiftPeople: new Set(todayShifts.map(s => s.member_id)).size,
    shiftHours: hours,
    calls, keyman,
    keymanRate: calls ? Math.round((keyman / calls) * 1000) / 10 : 0,
    appos: ownAppos.length,
    reward: ownAppos.reduce((t, a) => t + (a.intern_reward || 0), 0),
  };
}
