// ============================================================
// 報酬計算・おすすめスコア計算
// ============================================================
import { C } from '../constants/colors';
import { getIndustryCategory, parseTimeRange } from './industry';

// ランクとインセンティブ率の自動計算（累計売上から判定）
// orgSettings: org_settingsテーブルから取得した { setting_key: setting_value } マップ（省略時はデフォルト値）
export const calcRankAndRate = (totalSales, orgSettings = null) => {
  const s = orgSettings || {};
  const superRate   = s.reward_rate_super_spartan != null ? Number(s.reward_rate_super_spartan) / 100 : 0.28;
  const spartanRate = s.reward_rate_spartan       != null ? Number(s.reward_rate_spartan)       / 100 : 0.27;
  const playerRate  = s.reward_rate_player        != null ? Number(s.reward_rate_player)        / 100 : 0.25;
  const traineeRate = s.reward_rate_trainee       != null ? Number(s.reward_rate_trainee)       / 100 : 0.22;
  if (totalSales >= 10000000) return { rank: 'スーパースパルタン', rate: superRate };
  if (totalSales >= 5000000)  return { rank: 'スパルタン',         rate: spartanRate };
  if (totalSales >= 2000000)  return { rank: 'プレイヤー',          rate: playerRate };
  return { rank: 'トレーニー', rate: traineeRate };
};

// 架電おすすめスコア計算
// latestCallAt: そのリストの最終架電セッション started_at (ISO string | null)
// createdAt:    call_lists.created_at (ISO string | null)
export const getCurrentRecommendation = (rules, industry, now, latestCallAt, createdAt) => {
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hour + minutes / 60;

  // 架電時間外チェック（7時以前・20時以降）
  if (hour < 7 || hour >= 20) {
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

  // --- Combined score: 50% time, 30% import, 20% recency ---
  const combined = Math.round(timeScore * 0.50 + importScore * 0.30 + recencyScore * 0.20);

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
