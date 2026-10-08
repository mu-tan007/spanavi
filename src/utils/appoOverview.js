// アポ一覧の上の段（やること4つ・今週の面談）の数え方（2026-10-07 見本どおり）。
// 日付は 'YYYY-MM-DD'（日本時間）の文字列で比べる。

export function daysBefore(day, n) {
  const t = Date.parse(day + 'T00:00:00Z') - n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function todayJst(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

/** 面談日を過ぎたのに状態が「アポ取得」「事前確認済」のまま */
export function isStale(a, today) {
  return !!a.meetDate && a.meetDate < today && (a.status === 'アポ取得' || a.status === '事前確認済');
}

/** 今日から n 営業日後まで（土日は数えない・間の土日は含める）の最後の日。祝日は見ていない */
export function throughBusinessDay(today, n) {
  let t = Date.parse(today + 'T00:00:00Z'), count = 0;
  while (count < n) {
    t += 86400000;
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/** やることのカード。押したときの絞り込みにも同じ判定を使う */
export const TODO_RULES = {
  // 新着アポ：まだアポ取得報告を送っていないもの（自社の開拓・面談日を過ぎたものは除く）。2026-10-08 むー様
  //   取得日が直近14日のものだけ（7〜8月の面談日の無い古いアポは出さない）
  new: (a, today) => a.status === 'アポ取得' && a.emailStatus !== 'sent' && !a.isProspecting && !!a.getDate && a.getDate >= daysBefore(today, 14) && (!a.meetDate || a.meetDate >= today),
  // 本日の事前確認：#事前確認 の通知と同じ範囲（面談が当日〜2営業日後で、状態がアポ取得のまま）。2026-10-08 むー様
  today_pre: (a, today) => a.status === 'アポ取得' && !!a.meetDate && a.meetDate >= today && a.meetDate <= throughBusinessDay(today, 2),
  // キャンセル・リスケ中：月（や期間）を選んでいればその期間の面談月のもの。全期間なら面談日が直近60日（2026-10-08 むー様）
  cancel: (a, today, range) => a.status === 'キャンセル' && inRange(a, today, range),
  res: (a, today, range) => a.status === 'リスケ中' && inRange(a, today, range),
};

/** range = { from: 'YYYY-MM', to: 'YYYY-MM' }（どちらか空でもよい）。null なら直近60日 */
function inRange(a, today, range) {
  if (!a.meetDate) return false;
  if (!range) return a.meetDate >= daysBefore(today, 60);
  const m = a.meetDate.slice(0, 7);
  return (!range.from || m >= range.from) && (!range.to || m <= range.to);
}

export function todoCounts(appos, today, range = null) {
  const out = {};
  for (const k of Object.keys(TODO_RULES)) out[k] = appos.filter(a => TODO_RULES[k](a, today, range)).length;
  return out;
}

/** 今日を含む週の月〜金（土日なら次の週） */
export function weekDays(today) {
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay(); // 0=日
  const mondayOffset = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  const W = ['日', '月', '火', '水', '木', '金', '土'];
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(t.getTime() + (mondayOffset + i) * 86400000);
    const iso = x.toISOString().slice(0, 10);
    return { date: iso, label: `${x.getUTCMonth() + 1}/${x.getUTCDate()}`, dow: W[x.getUTCDay()] };
  });
}

/** 今週の面談：日ごとに時刻順。キャンセルも線を引いて出す */
export function weekMeetings(appos, days) {
  const set = new Set(days.map(d => d.date));
  const by = Object.fromEntries(days.map(d => [d.date, []]));
  for (const a of appos) if (set.has(a.meetDate)) by[a.meetDate].push(a);
  for (const k of Object.keys(by)) by[k].sort((a, b) => (a.meetTime || '99').localeCompare(b.meetTime || '99'));
  return by;
}

/** 表の中では面談日を過ぎたものを先頭に寄せる（ほかの並びは保つ） */
export function staleFirst(rows, today) {
  return [...rows.filter(a => isStale(a, today)), ...rows.filter(a => !isStale(a, today))];
}

export function shortCompany(name = '') {
  return name.replace(/株式会社|（株）|\(株\)|有限会社|合同会社|一般社団法人|社会保険労務士法人/g, '').trim() || name;
}
