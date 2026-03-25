// ============================================================
// 報酬計算・おすすめスコア計算
// ============================================================
import { C } from '../constants/colors';
import { getIndustryCategory, parseTimeRange } from './industry';

// デフォルトのランク定義
const DEFAULT_RANKS = [
  { name: 'スーパースパルタン', threshold: 10000000 },
  { name: 'スパルタン',         threshold: 5000000 },
  { name: 'プレイヤー',          threshold: 2000000 },
  { name: 'トレーニー',          threshold: 0 },
];

// ランクとインセンティブ率の自動計算（累計売上から判定）
// orgSettings: org_settingsテーブルから取得した { setting_key: setting_value } マップ（省略時はデフォルト値）
export const calcRankAndRate = (totalSales, orgSettings = null) => {
  const s = orgSettings || {};

  // org_settingsからランク定義を取得（未設定時はデフォルト）
  let ranks = DEFAULT_RANKS;
  if (s.rank_definitions) {
    try {
      const parsed = JSON.parse(s.rank_definitions);
      if (Array.isArray(parsed) && parsed.length > 0) ranks = parsed;
    } catch { /* use defaults */ }
  }

  // 閾値降順でソートしてマッチ
  const sorted = [...ranks].sort((a, b) => b.threshold - a.threshold);

  // デフォルトのインセンティブ率マップ
  const defaultRates = { 'スーパースパルタン': 0.28, 'スパルタン': 0.27, 'プレイヤー': 0.25, 'トレーニー': 0.22 };
  // インデックスベースのフォールバック率
  const fallbackRates = [0.28, 0.27, 0.25, 0.22];

  for (let i = 0; i < sorted.length; i++) {
    if (totalSales >= sorted[i].threshold) {
      // 既存のreward_rate_*キーまたはデフォルト率を使用
      const legacyKey = 'reward_rate_' + sorted[i].name.toLowerCase().replace(/\s+/g, '_');
      const rate = s[legacyKey] != null ? Number(s[legacyKey]) / 100
        : defaultRates[sorted[i].name] ?? fallbackRates[i] ?? 0.22;
      return { rank: sorted[i].name, rate };
    }
  }

  // 全閾値未満 → 最下位ランク
  const last = sorted[sorted.length - 1];
  return { rank: last.name, rate: defaultRates[last.name] ?? 0.22 };
};

// 架電おすすめスコア計算
// latestCallAt: そのリストの最終架電セッション started_at (ISO string | null)
// createdAt:    call_lists.created_at (ISO string | null)
// orgSettings:  org_settingsテーブルから取得した { setting_key: setting_value } マップ（省略時はデフォルト値）
export const getCurrentRecommendation = (rules, industry, now, latestCallAt, createdAt, orgSettings = null) => {
  const s = orgSettings || {};
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hour + minutes / 60;

  // 架電時間帯（org_settingsから取得、デフォルト7〜20時）
  const hourStart = s.calling_hour_start != null ? Number(s.calling_hour_start) : 7;
  const hourEnd = s.calling_hour_end != null ? Number(s.calling_hour_end) : 20;

  if (hour < hourStart || hour >= hourEnd) {
    return { score: 0, label: "架電時間外", color: C.textLight, timeScore: 0, timeLabel: "架電時間外", recencyScore: 0, recencyLabel: "", isOutsideHours: true };
  }

  // --- Time/Day score (0-100) ---
  const cat = getIndustryCategory(industry);
  const rule = rules.find(r => r.industry === cat);
  let timeScore = 50;
  let timeLabel = "通常";

  if (rule) {
    if (rule.badDays.includes(dayOfWeek)) {
      timeScore = 5;
      timeLabel = "定休日";
    } else {
      const goodRanges = parseTimeRange(rule.goodHours);
      const badRanges = parseTimeRange(rule.badHours);
      const inBad = badRanges.some(r => currentTime >= r.start && currentTime < r.end);
      const inGood = goodRanges.some(r => currentTime >= r.start && currentTime < r.end);

      if (inBad) { timeScore = 20; timeLabel = "非推奨帯"; }
      else if (inGood && rule.goodDays.includes(dayOfWeek)) { timeScore = 95; timeLabel = "ゴールデン"; }
      else if (rule.goodDays.includes(dayOfWeek)) { timeScore = 60; timeLabel = "良好"; }
      else { timeScore = 40; }
    }
  }

  // --- Recency score (0-100): higher = longer since last called = more fresh ---
  let recencyScore = 100; // default: not recently called = highest priority
  let recencyLabel = "未架電";
  if (latestCallAt) {
    const daysSince = (now - new Date(latestCallAt)) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) { recencyScore = 10; recencyLabel = "本日架電済"; }
    else if (daysSince < 2) { recencyScore = 30; recencyLabel = "昨日架電"; }
    else if (daysSince < 3) { recencyScore = 50; recencyLabel = "3日以内"; }
    else if (daysSince < 7) { recencyScore = 65; recencyLabel = "1週間以内"; }
    else if (daysSince < 14) { recencyScore = 80; recencyLabel = "2週間以内"; }
    else if (daysSince < 30) { recencyScore = 90; recencyLabel = "1ヶ月以内"; }
    else { recencyScore = 95; recencyLabel = Math.floor(daysSince) + "日前"; }
  }

  // --- Import score (0-100): higher = imported more recently = higher priority ---
  let importScore = 25; // default: unknown age
  if (createdAt) {
    const daysSinceImport = (now - new Date(createdAt)) / (1000 * 60 * 60 * 24);
    if (daysSinceImport <= 1)       { importScore = 100; }
    else if (daysSinceImport <= 2)  { importScore = 90; }
    else if (daysSinceImport <= 3)  { importScore = 80; }
    else if (daysSinceImport <= 7)  { importScore = 65; }
    else if (daysSinceImport <= 14) { importScore = 45; }
    else if (daysSinceImport <= 31) { importScore = 25; }
    else                            { importScore = 10; }
  }

  // --- Combined score: configurable weights (default 50/30/20) ---
  const wTime = (s.score_weight_time != null ? Number(s.score_weight_time) : 50) / 100;
  const wImport = (s.score_weight_import != null ? Number(s.score_weight_import) : 30) / 100;
  const wRecency = (s.score_weight_recency != null ? Number(s.score_weight_recency) : 20) / 100;
  const combined = Math.round(timeScore * wTime + importScore * wImport + recencyScore * wRecency);

  // --- Determine label and color ---
  let label, color;
  if (timeScore <= 10) {
    label = timeLabel;
    color = C.red;
  } else if (combined >= 80) {
    label = "おすすめ";
    color = C.green;
  } else if (combined >= 60) {
    label = "良好";
    color = C.navyLight;
  } else if (combined >= 40) {
    label = "通常";
    color = C.textLight;
  } else if (combined >= 20) {
    label = "低";
    color = C.orange;
  } else {
    label = timeLabel;
    color = C.red;
  }

  return { score: combined, label, color, timeScore, timeLabel, recencyScore, recencyLabel, importScore };
};
