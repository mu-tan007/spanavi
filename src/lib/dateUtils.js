const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateWithWeekday(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m) return String(value);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (isNaN(dt.getTime())) return String(value);
  return `${value}（${WEEKDAYS[dt.getDay()]}）`;
}
