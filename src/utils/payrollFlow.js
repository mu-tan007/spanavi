// 報酬の月の流れ（2026-10-07 むー様確認の見本どおり）：月末締め → 請求書の提出 → 翌月20日に確定 → 翌月末に振込

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 開いたときに出す月：先月（いま締めている月）。一覧に無ければ一覧の最後 */
export function defaultPayrollMonth(months, today) {
  const [y, m] = today.split('-').map(Number);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  const hit = months.find(x => x.year === py && x.month === pm);
  return (hit || months[months.length - 1] || { label: '' }).label;
}

/**
 * その月の流れ。done＝済み、cur＝いまここ
 * @returns {{ steps: Array<{key,label,sub,state}>, headline: string }}
 */
export function payrollFlow({ year, month, today, isConfirmed, submitted, payees }) {
  const ny = month === 12 ? year + 1 : year, nm = month === 12 ? 1 : month + 1;
  const close = `${year}-${pad(month)}-${pad(lastDay(year, month))}`;
  const fix = `${ny}-${pad(nm)}-20`;
  const pay = `${ny}-${pad(nm)}-${pad(lastDay(ny, nm))}`;
  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  let cur;
  if (today <= close) cur = 0;
  else if (!isConfirmed) cur = 1;
  else if (today <= pay) cur = 3;
  else cur = 4;
  const steps = [
    { key: 'close', label: '締め', sub: md(close) },
    { key: 'invoice', label: '請求書の提出', sub: `${submitted} / ${payees}人` },
    { key: 'fix', label: '確定', sub: md(fix) },
    { key: 'pay', label: '振込', sub: md(pay) },
  ].map((s, i) => ({ ...s, state: i < cur ? 'done' : i === cur ? 'cur' : '' }));
  // 確定は請求書の段の中で行う（確定したら請求書の段も済み）
  if (isConfirmed) steps[2].state = 'done';
  const headline = cur === 0 ? '月の途中（まだ締めていない）'
    : cur === 1 ? (submitted < payees ? '請求書を集めている' : '請求書がそろった。確定できる')
      : cur === 3 ? '確定済み。振込を待っている' : '振込まで終わった月';
  return { steps, headline };
}
