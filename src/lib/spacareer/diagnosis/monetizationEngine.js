// ============================================================
// マネタイズ領域診断 スコアリングエンジン（決定論・純関数・AIなし）
// ----------------------------------------------------------------
// 受講生の回答（[{question_id, value}]）とナレッジベースから、
// 「どの領域 × どの業界で勝つか」をスコアリングして返す。
//
// 設計方針:
//   - 感情（やってみたい/面白そう＝interest）の重みを最も高くする（むー様指示）。
//   - フォーム営業を基本とし、業界の formSalesFit を加味する。
//   - 仮定値（商談化率・受注率など）はこの初期エンジンには持たせない。
//     収益ファネルはフォーム営業反応率 0.05% 固定のみを提示する。
// ============================================================

import {
  MONETIZATION_DOMAINS, INDUSTRIES,
  DOMAIN_BY_ID, INDUSTRY_BY_ID, domainIndustryAffinity,
} from './monetizationKnowledgeBase';

// フォーム営業の反応率（一律 0.05%）。テレアポは想定しない。
export const REACTION_RATE = 0.0005;

// 各領域が主に依存する強み軸（execution/influencing/relationship/strategic）
const DOMAIN_STRENGTH_AXES = {
  content_sales: ['influencing', 'strategic'],
  affiliate: ['strategic', 'execution'],
  ops_agency: ['execution', 'strategic'],
  consulting: ['strategic', 'relationship'],
  tool_sales: ['strategic', 'execution'],
  dev: ['execution', 'strategic'],
  writing: ['influencing', 'execution'],
  video_edit: ['execution', 'influencing'],
  design: ['execution', 'strategic'],
  web_production: ['execution', 'strategic'],
  online_assistant: ['relationship', 'execution'],
  form_sales_agency: ['influencing', 'execution'],
  ai_enablement: ['strategic', 'execution'],
};

// 各領域の「見せ方」グループ
const DOMAIN_PRESENTATION = {
  content_sales: 'broadcast', affiliate: 'broadcast', writing: 'broadcast', video_edit: 'broadcast',
  dev: 'handson', web_production: 'handson', design: 'handson', tool_sales: 'handson', ai_enablement: 'handson',
  consulting: 'advisory', online_assistant: 'advisory', form_sales_agency: 'advisory', ops_agency: 'advisory',
};

// 保有スキル → 親和性の高い領域
const SKILL_TO_DOMAINS = {
  writing: ['writing', 'content_sales', 'affiliate'],
  design: ['design', 'web_production'],
  video: ['video_edit'],
  coding: ['dev', 'web_production', 'tool_sales'],
  marketing: ['ops_agency', 'affiliate', 'form_sales_agency'],
  sales: ['form_sales_agency', 'consulting', 'ops_agency'],
  ai_tools: ['ai_enablement', 'tool_sales'],
};

// スコア重み（合計 1.0）。interest（感情）が最大。
const WEIGHTS = {
  interest: 0.30,
  expertise: 0.16,
  barrier: 0.14,
  strength: 0.12,
  ai: 0.10,
  form: 0.10,
  affinity: 0.08,
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function norm5(v) { return clamp((v || 0) / 5, 0, 1); } // 1-5 → 0-1

// 回答配列を構造化スコアへ
export function parseAnswers(answers) {
  const map = {};
  for (const a of (answers || [])) {
    if (a && a.question_id != null) map[a.question_id] = a.value;
  }

  const domainInterest = {};
  for (const d of MONETIZATION_DOMAINS) {
    const v = map[`interest_${d.id}`];
    domainInterest[d.id] = typeof v === 'number' ? v : 3; // 未回答は中立
  }

  const industryExpertise = {};
  for (const ind of INDUSTRIES) {
    const v = map[`industry_${ind.id}`];
    industryExpertise[ind.id] = typeof v === 'number' ? v : 1; // 未回答は「詳しくない」
  }

  // 強み4軸（各2問の平均）
  const axisAcc = { execution: [], influencing: [], relationship: [], strategic: [] };
  for (const key of Object.keys(map)) {
    const m = key.match(/^strength_(execution|influencing|relationship|strategic)_/);
    if (m && typeof map[key] === 'number') axisAcc[m[1]].push(map[key]);
  }
  const strengthAxis = {};
  for (const ax of Object.keys(axisAcc)) {
    const arr = axisAcc[ax];
    strengthAxis[ax] = arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 3;
  }

  const presentation = {
    style: map.pres_style || null,
    stockflow: map.pres_stockflow || null,
    public: map.pres_public || null,
  };
  const resource = {
    time: map.res_time || null,
    speed: map.res_speed || null,
    skills: Array.isArray(map.res_skill) ? map.res_skill : [],
    risk: map.res_risk || null,
  };

  return { domainInterest, industryExpertise, strengthAxis, presentation, resource };
}

function strengthMatch(domainId, strengthAxis) {
  const axes = DOMAIN_STRENGTH_AXES[domainId] || [];
  if (!axes.length) return 3;
  const sum = axes.reduce((s, ax) => s + (strengthAxis[ax] || 3), 0);
  return sum / axes.length; // 1-5
}

// 見せ方・資源による微調整（±0.06 程度に抑える。感情を主役のまま nudge）
function domainModifier(domainId, parsed) {
  let mod = 0;
  const presGroup = DOMAIN_PRESENTATION[domainId];
  const { presentation, resource } = parsed;

  if (presentation.style && presGroup) {
    mod += presentation.style === presGroup ? 0.03 : -0.015;
  }
  if (presentation.public === 'avoid' && presGroup === 'broadcast') mod -= 0.03;
  if (presentation.public === 'love' && presGroup === 'broadcast') mod += 0.015;

  if (presentation.stockflow === 'stock' && ['content_sales', 'affiliate', 'tool_sales'].includes(domainId)) mod += 0.02;
  if (presentation.stockflow === 'flow' && ['ops_agency', 'dev', 'writing', 'video_edit', 'form_sales_agency', 'online_assistant'].includes(domainId)) mod += 0.02;

  // 保有スキルが直結する領域を後押し
  for (const sk of (resource.skills || [])) {
    if ((SKILL_TO_DOMAINS[sk] || []).includes(domainId)) { mod += 0.02; break; }
  }

  // 早く稼ぎたい × 参入しやすい領域
  const dom = DOMAIN_BY_ID[domainId];
  if (resource.speed === 'fast' && dom && dom.freelanceAccessibility >= 5) mod += 0.015;

  return clamp(mod, -0.06, 0.06);
}

// 1組合せのスコア（0-100）と内訳
function scoreCombo(domainId, industryId, parsed) {
  const dom = DOMAIN_BY_ID[domainId];
  const ind = INDUSTRY_BY_ID[industryId];

  const parts = {
    interest: norm5(parsed.domainInterest[domainId]),
    expertise: norm5(parsed.industryExpertise[industryId]),
    barrier: norm5((dom.freelanceAccessibility + ind.freelanceAccessibility) / 2),
    strength: norm5(strengthMatch(domainId, parsed.strengthAxis)),
    ai: norm5(ind.aiOpportunity),
    form: norm5(ind.formSalesFit),
    affinity: norm5(domainIndustryAffinity(domainId, industryId)),
  };

  let raw = 0;
  for (const k of Object.keys(WEIGHTS)) raw += WEIGHTS[k] * parts[k];
  raw += domainModifier(domainId, parsed);
  raw = clamp(raw, 0, 1);

  return { score: Math.round(raw * 100), parts };
}

function comboRationale(domainId, industryId) {
  const dom = DOMAIN_BY_ID[domainId];
  const ind = INDUSTRY_BY_ID[industryId];
  return {
    pains: ind.pains.slice(0, 3),
    aiOpportunity: ind.aiOpportunity,
    industryNote: ind.note,
    presentation: dom.presentation,
    unitPriceRange: dom.unitPriceRange,
    howToEnter: `${ind.label}の「${ind.pains[0]}」に対し、${dom.label}（${dom.presentation}）でフォーム営業から接点を作る。`,
  };
}

// フォーム営業の収益ファネル（反応率0.05%固定。下流の仮定値は未設定）
export function estimateFormSalesFunnel(approaches) {
  return {
    approaches,
    reactionRate: REACTION_RATE,
    expectedResponses: Math.round(approaches * REACTION_RATE * 10) / 10,
  };
}

// メイン: 回答 → 診断結果
export function computeMonetizationResult(answers) {
  const parsed = parseAnswers(answers);

  // 全 領域×業界 を採点
  const all = [];
  for (const d of MONETIZATION_DOMAINS) {
    for (const ind of INDUSTRIES) {
      const { score, parts } = scoreCombo(d.id, ind.id, parsed);
      all.push({
        domainId: d.id, domainLabel: d.label,
        industryId: ind.id, industryLabel: ind.label,
        score, parts,
      });
    }
  }
  all.sort((a, b) => b.score - a.score);

  // 上位コンボ（領域の重複を避け、多様な提案にする：1領域あたり最大1コンボ）
  const seenDomain = new Set();
  const topCombos = [];
  for (const c of all) {
    if (seenDomain.has(c.domainId)) continue;
    seenDomain.add(c.domainId);
    topCombos.push({ ...c, rationale: comboRationale(c.domainId, c.industryId) });
    if (topCombos.length >= 5) break;
  }

  // 領域別ベストスコア（レーダー/一覧用）
  const bestByDomain = {};
  for (const c of all) {
    if (!bestByDomain[c.domainId] || c.score > bestByDomain[c.domainId].score) {
      bestByDomain[c.domainId] = { domainId: c.domainId, domainLabel: c.domainLabel, score: c.score };
    }
  }
  const domainRanking = Object.values(bestByDomain).sort((a, b) => b.score - a.score);

  const primary = topCombos[0] || null;
  const funnel = {
    note: 'フォーム営業（反応率0.05%固定）の概算。商談化率・受注率などの仮定値は未設定です。',
    samples: [1000, 5000, 10000].map(estimateFormSalesFunnel),
    unitPriceRange: primary ? DOMAIN_BY_ID[primary.domainId].unitPriceRange : null,
  };

  return {
    version: 1,
    primary,
    topCombos,
    domainRanking,
    funnel,
    parsedSummary: {
      topInterests: Object.entries(parsed.domainInterest)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([id, v]) => ({ id, label: DOMAIN_BY_ID[id].label, value: v })),
      topIndustries: Object.entries(parsed.industryExpertise)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([id, v]) => ({ id, label: INDUSTRY_BY_ID[id].label, value: v })),
      strengthAxis: parsed.strengthAxis,
      resource: parsed.resource,
      presentation: parsed.presentation,
    },
  };
}
