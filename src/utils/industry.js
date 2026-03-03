// ============================================================
// 業種カテゴリ判定・時間帯パースユーティリティ
// ============================================================

export const getIndustryCategory = (industry) => {
  if (industry.includes("建設") || industry.includes("土木") || industry.includes("サブコン") || industry.includes("管工事") || industry.includes("電気工事") || industry.includes("リフォーム") || industry.includes("建築") || industry.includes("建物") || industry === "建設コンサルタント") return "建設";
  if (industry.includes("製造") || industry.includes("溶接") || industry.includes("表面処理") || industry.includes("ニッチ製造") || industry.includes("食品製造") || industry.includes("食料品製造") || industry.includes("食品") || industry.includes("食肉") || industry.includes("食料") || industry === "給食") return "製造";
  if (industry.includes("不動産")) return "不動産";
  if (industry === "介護" || industry === "福祉用具") return "介護";
  if (industry === "調剤薬局") return "調剤薬局";
  if (industry === "医療法人") return "医療法人";
  if (industry.includes("IT") || industry.includes("情報通信") || industry.includes("受託開発") || industry.includes("人材")) return "IT";
  if (industry.includes("物流") || industry.includes("倉庫") || industry === "タクシー") return "物流";
  if (industry === "飲食業" || industry.includes("飲食")) return "製造";
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
