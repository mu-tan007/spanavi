// 架電の記録のメモを文章にする（2026-10-07）。
// 再コールの記録は {"recall_date","recall_time","assignee","note","recall_completed"} の形で入っているため、
// カルテの対応履歴にそのまま出すと生のデータになる。

export function callMemoText(memo) {
  const raw = String(memo ?? '').trim();
  if (!raw.startsWith('{')) return raw;
  let o;
  try { o = JSON.parse(raw); } catch { return raw; }
  if (!o || typeof o !== 'object') return raw;
  const parts = [];
  if (o.recall_date) {
    const [, m, d] = String(o.recall_date).split('-').map(Number);
    const t = o.recall_time ? ` ${String(o.recall_time).slice(0, 5)}` : '';
    const who = o.assignee ? `（${String(o.assignee).split(/\s/)[0]}）` : '';
    parts.push(`再コール ${m}/${d}${t}${who}${o.recall_completed ? ' ・ かけ直し済み' : ''}`);
  }
  if (o.note) parts.push(String(o.note));
  if (o.memo) parts.push(String(o.memo));
  return parts.join(' ／ ') || '';
}
