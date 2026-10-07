import { describe, it, expect } from 'vitest';
import { industryCore, matchesListIndustries } from './maNewsIndustry';

describe('maNewsIndustry', () => {
  it('業種名を比べやすい形に', () => {
    expect(industryCore('専門サービス業（他に分類されないもの）')).toBe('専門サービス');
    expect(industryCore('総合工事業')).toBe('総合工事');
  });
  it('架電中のリストの業種と突き合わせる', () => {
    expect(matchesListIndustries('総合工事業', ['建設業', '警備'])).toBe(true);
    expect(matchesListIndustries('警備業', ['警備③'])).toBe(true);
    expect(matchesListIndustries('食料品製造業', ['食品メーカー'])).toBe(true);
    expect(matchesListIndustries('情報サービス業', ['IT'])).toBe(true);
    expect(matchesListIndustries('娯楽業', ['建設業', '警備'])).toBe(false);
    expect(matchesListIndustries('', ['建設業'])).toBe(false);
    expect(matchesListIndustries('道路貨物運送業', ['物流'])).toBe(true);
    expect(matchesListIndustries('道路貨物運送業', ['運送'])).toBe(true);
  });
});
