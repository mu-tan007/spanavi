// アポ一覧の上の段（やること4つ・今週の面談）の数え方（2026-10-07 見本どおり）。
// 日付は 'YYYY-MM-DD'（日本時間）の文字列で比べる。

const ACTIVE = ['アポ取得', '事前確認済', 'リスケ中'];

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

/** やること4つ。押したときの絞り込みにも同じ判定を使う */
export const TODO_RULES = {
  unsent: (a, today) => ACTIVE.includes(a.status) && a.emailStatus !== 'sent' && !!a.meetDate && a.meetDate >= today,
  stale: (a, today) => isStale(a, today),
  pre: (a, today) => a.status === 'アポ取得' && !!a.meetDate && a.meetDate >= today,
  // リスケ中は元の面談日が直近60日以内のものだけ（何か月も前のリスケ中は追っても戻らない）
  res: (a, today) => a.status === 'リスケ中' && !!a.meetDate && a.meetDate >= daysBefore(today, 60),
};

export function todoCounts(appos, today) {
  const out = {};
  for (const k of Object.keys(TODO_RULES)) out[k] = appos.filter(a => TODO_RULES[k](a, today)).length;
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
