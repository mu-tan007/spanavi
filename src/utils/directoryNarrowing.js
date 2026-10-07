// 企業DBの「条件を足すごとに何社まで減ったか」の段（2026-10-07 見本どおり）
// 適用した条件から、後ろのチップを1つずつ外した条件を作る。f[0]＝条件なし（全国）… f[n]＝適用した条件。

export const MAX_STEPS = 6;

/**
 * @param {object} applied 適用した条件
 * @param {(f:object)=>Array<{k:string,label:string,patch:object}>} chipsOf 条件 → チップ
 * @returns {Array<{label:string, filters:object}>} 先頭は「全国」。チップが多すぎるときは null
 */
export function narrowingSteps(applied, chipsOf) {
  const chips = chipsOf(applied);
  if (chips.length === 0 || chips.length > MAX_STEPS) return null;
  // 後ろのチップを1つずつ外していく（同じ項目に複数あっても1つずつ外れるよう、毎回チップを作り直す）
  const filters = [applied];
  let f = applied;
  for (let i = 0; i < chips.length; i++) {
    const cur = chipsOf(f);
    f = { ...f, ...cur[cur.length - 1].patch };
    filters.unshift(f);
  }
  return filters.map((x, i) => ({ label: i === 0 ? '全国' : `＋ ${chips[i - 1].label}`, filters: x }));
}

/** 棒の長さ（%）。差が大きいので平方根で縮め、最小でも少し見えるように */
export function stepWidth(n, total) {
  if (!total) return 0;
  return Math.max(1.2, Math.sqrt(n / total) * 100);
}
