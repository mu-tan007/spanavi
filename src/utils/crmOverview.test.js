import { describe, it, expect } from 'vitest';
import { daysSince, quickCounts, axisX, ageClass, ruleCountByClient, QUICK_RULES } from './crmOverview';

const T = '2026-10-07';
const C = [
  { _supaId: 'a', lastContactAt: '2026-06-18', stage: '架電中' },
  { _supaId: 'b', lastContactAt: '2026-10-07', stage: '架電中' },
  { _supaId: 'c', lastContactAt: '', stage: '一時停止（先方都合）' },
  { _supaId: 'd', lastContactAt: '2026-09-20', stage: '架電中' },
];

describe('crmOverview', () => {
  it('日数を数える（記録なしは null）', () => {
    expect(daysSince('2026-10-07', T)).toBe(0);
    expect(daysSince('2026-09-07', T)).toBe(30);
    expect(daysSince('', T)).toBeNull();
  });
  it('数字4つを数える（記録なしは30日以上に入れる）', () => {
    expect(quickCounts(C, T, { b: 2 })).toEqual({ stale: 2, pause: 1, today: 1, norule: 3 });
    expect(C.filter(c => QUICK_RULES.stale(c, T)).map(c => c._supaId)).toEqual(['a', 'c']);
  });
  it('軸の位置：30日で45%、120日以上と記録なしは右端', () => {
    expect(axisX(0)).toBe(0);
    expect(axisX(30)).toBeCloseTo(45);
    expect(axisX(300)).toBe(100);
    expect(axisX(null)).toBe(100);
  });
  it('色の段：14日から黄土、30日から赤', () => {
    expect([ageClass(3), ageClass(14), ageClass(30), ageClass(null)]).toEqual(['ok', 'w', 'd', 'd']);
  });
  it('聞くこと・条件の数を会社ごとに足す', () => {
    expect(ruleCountByClient([{ client_id: 'x', items: [1, 2], conditions: [1] }, { client_id: 'x', items: [1], conditions: [] }])).toEqual({ x: 4 });
  });
});
