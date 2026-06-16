import { describe, it, expect } from 'vitest';
import {
  computeMonetizationResult, estimateFormSalesFunnel, REACTION_RATE,
} from './monetizationEngine';
import { MONETIZATION_DOMAINS, INDUSTRIES } from './monetizationKnowledgeBase';

// テスト用回答ビルダー: 全領域interest=3, 全業界familiarity=1, 強み=3 を基準に、
// overrides で個別の question_id を上書きする。
function buildAnswers(overrides = {}) {
  const answers = [];
  for (const d of MONETIZATION_DOMAINS) answers.push({ question_id: `interest_${d.id}`, value: 3 });
  for (const ind of INDUSTRIES) answers.push({ question_id: `industry_${ind.id}`, value: 1 });
  ['execution', 'influencing', 'relationship', 'strategic'].forEach((ax) => {
    answers.push({ question_id: `strength_${ax}_0`, value: 3 });
  });
  // overrides を反映（同 id があれば置換）
  for (const [qid, value] of Object.entries(overrides)) {
    const ex = answers.find((a) => a.question_id === qid);
    if (ex) ex.value = value; else answers.push({ question_id: qid, value });
  }
  return answers;
}

describe('monetizationEngine', () => {
  it('REACTION_RATE はフォーム営業0.05%固定', () => {
    expect(REACTION_RATE).toBe(0.0005);
  });

  it('estimateFormSalesFunnel: 反応率0.05%で件数を返す', () => {
    expect(estimateFormSalesFunnel(1000).expectedResponses).toBe(0.5);
    expect(estimateFormSalesFunnel(10000).expectedResponses).toBe(5);
  });

  it('決定論: 同じ回答なら毎回同じ結果', () => {
    const a = buildAnswers({ interest_ai_enablement: 5 });
    const r1 = JSON.stringify(computeMonetizationResult(a));
    const r2 = JSON.stringify(computeMonetizationResult(a));
    expect(r1).toBe(r2);
  });

  it('上位コンボは5件・領域は重複しない', () => {
    const r = computeMonetizationResult(buildAnswers());
    expect(r.topCombos).toHaveLength(5);
    const domains = r.topCombos.map((c) => c.domainId);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it('全スコアは0〜100', () => {
    const r = computeMonetizationResult(buildAnswers({ interest_consulting: 5 }));
    for (const c of r.topCombos) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });

  it('感情（interest）が最優先: 強く惹かれた領域が1位候補に入る', () => {
    // ai_enablement に最大の興味を置き、その業界(care)経験も付与
    const r = computeMonetizationResult(buildAnswers({
      interest_ai_enablement: 5,
      industry_care: 5,
    }));
    expect(r.primary.domainId).toBe('ai_enablement');
  });

  it('興味が低い領域は1位にならない', () => {
    const r = computeMonetizationResult(buildAnswers({
      interest_dev: 1,
      interest_content_sales: 5,
    }));
    expect(r.primary.domainId).not.toBe('dev');
  });

  it('funnel には仮定値未設定の注記と単価レンジが含まれる', () => {
    const r = computeMonetizationResult(buildAnswers({ interest_content_sales: 5 }));
    expect(r.funnel.note).toContain('仮定値');
    expect(r.funnel.unitPriceRange).toBeTruthy();
    expect(r.funnel.samples).toHaveLength(3);
  });

  it('削除済み領域(ライティング/動画編集)と業種(AI特化)は存在しない', () => {
    const domainIds = MONETIZATION_DOMAINS.map((d) => d.id);
    expect(domainIds).not.toContain('writing');
    expect(domainIds).not.toContain('video_edit');
    expect(INDUSTRIES.map((i) => i.id)).not.toContain('ai_native');
    // AIコンサルタントへの改称
    expect(MONETIZATION_DOMAINS.find((d) => d.id === 'ai_enablement').label).toBe('AIコンサルタント');
  });

  it('商談したくない場合: 商談必須の領域(コンサル/受託/AIコンサル)は1位にならない', () => {
    const r = computeMonetizationResult(buildAnswers({
      interest_consulting: 5, interest_dev: 5, interest_ai_enablement: 5,
      interest_affiliate: 5,
      res_meeting: 'no',
    }));
    expect(['consulting', 'dev', 'ai_enablement']).not.toContain(r.primary.domainId);
  });

  it('商談意向で商談必須領域のスコアが変わる(yes > no)', () => {
    const scoreOf = (meeting) => {
      const r = computeMonetizationResult(buildAnswers({
        interest_ai_enablement: 5, industry_care: 5, res_meeting: meeting,
      }));
      return r.domainRanking.find((d) => d.domainId === 'ai_enablement').score;
    };
    expect(scoreOf('yes')).toBeGreaterThan(scoreOf('no'));
  });
});
