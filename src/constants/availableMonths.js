// 選択可能月: 2026年3月固定スタート〜翌々月
export const AVAILABLE_MONTHS = (() => {
  const now = new Date();
  const result = [];
  let y = 2026, m = 3; // 3月固定スタート
  const endD = new Date(now.getFullYear(), now.getMonth() + 3, 0); // 翌々月末
  while (new Date(y, m - 1, 1) <= endD) {
    result.push({ label: m + "月", yyyymm: `${y}-${String(m).padStart(2, "0")}`, year: y, month: m });
    if (++m > 12) { m = 1; y++; }
  }
  return result;
})();
