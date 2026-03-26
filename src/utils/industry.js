// ============================================================
// 業種カテゴリ判定・時間帯パースユーティリティ
// ============================================================

// デフォルトのカテゴリマッピング（org_settings未設定時のフォールバック）
const DEFAULT_CATEGORY_MAP = {
  "建設": ["建設", "土木", "サブコン", "管工事", "電気工事", "リフォーム", "建築", "建物", "建設コンサルタント"],
  "製造": ["製造", "溶接", "表面処理", "ニッチ製造", "食品製造", "食料品製造", "食品", "食肉", "食料", "給食", "飲食業", "飲食"],
  "不動産": ["不動産"],
  "介護": ["介護", "福祉用具"],
  "調剤薬局": ["調剤薬局"],
  "医療法人": ["医療法人"],
  "IT": ["IT", "情報通信", "受託開発", "人材"],
  "物流": ["物流", "倉庫", "タクシー"],
};

/**
 * 業種名からカテゴリを判定
 * @param {string} industry - 業種名
 * @param {Object} [categoryMap] - オプショナル。org_settingsから取得したカテゴリマッピング
 * @returns {string} カテゴリ名
 */
export const getIndustryCategory = (industry, categoryMap = null) => {
  const map = categoryMap || DEFAULT_CATEGORY_MAP;
  for (const [category, keywords] of Object.entries(map)) {
    if (keywords.some(kw => industry === kw || industry.includes(kw))) return category;
  }
  if (industry.includes("全業種")) return "その他（平日一般）";
  return "その他（平日一般）";
};

export const parseTimeRange = (str) => {
  if (!str) return [];
  return str.split(",").map(s => s.trim()).filter(Boolean).map(range => {
    const [start, end] = range.split("〜").map(t => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; });
    return { start, end };
  });
};
