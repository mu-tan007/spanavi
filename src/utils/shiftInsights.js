// シフトの線表に重ねる数え方（2026-10-07 むー様確認の見本どおり）
//   時間ごとの人数・「社長につながりやすいのに人が少ない時間」・シフトの外の架電・週の6枚

const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

/** その時間（h:00〜h:59）に少しでもシフトが掛かっている人の数 */
export function headsByHour(dayShifts, hours) {
  return Object.fromEntries(hours.map(h => {
    const from = h * 60, to = from + 60;
    const ids = new Set(dayShifts.filter(s => toMin(s.start_time) < to && toMin(s.end_time) > from).map(s => s.member_id));
    return [h, ids.size];
  }));
}

/** つながりやすい（rate% 以上）のに人が少ない（maxHeads 人以下）時間 */
export function gapHours(rates, heads, { minRate = 7, maxHeads = 2, from = 8, to = 18, minCalls = 1000 } = {}) {
  return Object.keys(rates).map(Number)
    .filter(h => h >= from && h <= to)
    .filter(h => rates[h].rate >= minRate && rates[h].calls >= minCalls && (heads[h] ?? 0) <= maxHeads)
    .sort((a, b) => a - b);
}

/** その時間に、その人のシフトが掛かっているか（30分以上の重なりがあれば掛かっているとみなす） */
export function inShift(memberShifts, h) {
  const from = h * 60, to = from + 60;
  return memberShifts.some(s => Math.min(to, toMin(s.end_time)) - Math.max(from, toMin(s.start_time)) >= 30);
}

/** シフトの外の架電：{ 氏名: { hours: [h...], calls: n } } */
export function outsideShiftCalls(callsByMember, shiftsByMember) {
  const out = {};
  for (const [name, byHour] of Object.entries(callsByMember)) {
    const sh = shiftsByMember[name] || [];
    for (const [h, n] of Object.entries(byHour)) {
      if (n > 0 && !inShift(sh, Number(h))) {
        out[name] = out[name] || { hours: [], calls: 0 };
        out[name].hours.push(Number(h));
        out[name].calls += n;
      }
    }
  }
  return out;
}

/** 'YYYY-MM-DD' を含む週の月〜土 */
export function weekOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay();
  const mon = new Date(t.getTime() - ((dow + 6) % 7) * 86400000);
  const W = ['日', '月', '火', '水', '木', '金', '土'];
  return Array.from({ length: 6 }, (_, i) => {
    const x = new Date(mon.getTime() + i * 86400000);
    return { date: x.toISOString().slice(0, 10), m: x.getUTCMonth() + 1, d: x.getUTCDate(), dow: W[x.getUTCDay()] };
  });
}

/** 1日の人数と合計時間 */
export function daySummary(shifts, date) {
  const it = shifts.filter(s => s.shift_date === date);
  const hours = it.reduce((t, s) => t + Math.max(0, toMin(s.end_time) - toMin(s.start_time)) / 60, 0);
  return { people: new Set(it.map(s => s.member_id)).size, hours };
}
