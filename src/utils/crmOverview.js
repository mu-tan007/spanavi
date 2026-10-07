// 顧客管理の上の段（数字4つ・最後のやり取りからの日数の軸）の数え方（2026-10-07 見本どおり）

export function todayJst(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

/** 'YYYY-MM-DD' から今日までの日数。記録なしは null */
export function daysSince(day, today) {
  if (!day) return null;
  const a = Date.parse(String(day).slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(today + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export const PAUSE_STAGE = '一時停止（先方都合）';

/** 数字4つ。押したときの絞り込みにも同じ判定を使う（対象は支援中だけ） */
export const QUICK_RULES = {
  stale: (c, today) => { const d = daysSince(c.lastContactAt, today); return d == null || d >= 30; },
  pause: (c) => c.stage === PAUSE_STAGE,
  today: (c, today) => daysSince(c.lastContactAt, today) === 0,
  norule: (c, today, ruleCount) => !(ruleCount[c._supaId] > 0),
};

export function quickCounts(clients, today, ruleCount = {}) {
  const out = {};
  for (const k of Object.keys(QUICK_RULES)) out[k] = clients.filter(c => QUICK_RULES[k](c, today, ruleCount)).length;
  return out;
}

/** 日数 → 軸の位置（0〜100%）。30日までを左45%に広げ、120日以上は右端に寄せる */
export function axisX(d) {
  const v = d == null ? 120 : Math.min(d, 120);
  const s = v <= 30 ? (v / 30) * 0.45 : 0.45 + ((v - 30) / 90) * 0.55;
  return s * 100;
}

export function ageClass(d) {
  if (d == null || d >= 30) return 'd';
  if (d >= 14) return 'w';
  return 'ok';
}

/** report_rules の行 → client_id ごとの項目数（聞くこと＋条件） */
export function ruleCountByClient(rules = []) {
  const out = {};
  for (const r of rules) out[r.client_id] = (out[r.client_id] || 0) + (r.items?.length || 0) + (r.conditions?.length || 0);
  return out;
}
