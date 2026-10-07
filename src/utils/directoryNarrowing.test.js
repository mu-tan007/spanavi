import { describe, it, expect } from 'vitest';
import { narrowingSteps, stepWidth } from './directoryNarrowing';
import { DIRECTORY_FILTERS, directoryConditionChips } from './companyDirectoryFilters';

const chipsOf = (f) => directoryConditionChips(f, {});

describe('directoryNarrowing', () => {
  it('後ろの条件から1つずつ外した段を作る', () => {
    const applied = { ...DIRECTORY_FILTERS, prefecture: ['鹿児島県'], revenueMin: '100000', revenueMax: '500000', ageMin: '60' };
    const steps = narrowingSteps(applied, chipsOf);
    expect(steps.map(s => s.label)).toEqual(['全国', '＋ 都道府県：鹿児島県', `＋ ${chipsOf(applied)[1].label}`, `＋ ${chipsOf(applied)[2].label}`]);
    expect(steps[0].filters.prefecture).toEqual([]);
    expect(steps[0].filters.revenueMin).toBe('');
    expect(steps[1].filters.prefecture).toEqual(['鹿児島県']);
    expect(steps[1].filters.revenueMin).toBe('');
    expect(steps[3].filters).toEqual(applied);
  });
  it('同じ項目に2つ（都道府県2つ）でも1つずつ外す', () => {
    const applied = { ...DIRECTORY_FILTERS, prefecture: ['鹿児島県', '宮崎県'] };
    const steps = narrowingSteps(applied, chipsOf);
    expect(steps.map(s => s.filters.prefecture)).toEqual([[], ['鹿児島県'], ['鹿児島県', '宮崎県']]);
  });
  it('条件なし・多すぎるときは出さない', () => {
    expect(narrowingSteps(DIRECTORY_FILTERS, chipsOf)).toBeNull();
    const many = { ...DIRECTORY_FILTERS, prefecture: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] };
    expect(narrowingSteps(many, chipsOf)).toBeNull();
  });
  it('棒の長さ', () => {
    expect(stepWidth(516397, 516397)).toBe(100);
    expect(stepWidth(0, 516397)).toBe(1.2);
    expect(Math.round(stepWidth(6684, 516397))).toBe(11);
  });
});
