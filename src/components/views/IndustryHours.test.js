import { describe, it, expect, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import { bestHoursLabel, topHours } from './IndustryHours';

const h = (rates, calls = 500) => Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, { rate: v, calls }]));

describe('つながりやすい時間', () => {
  it('上位3つの時間を、続く時間はまとめて出す（建築工事の形：朝8時と夕方17〜18時）', () => {
    const b = h({ 8: .074, 9: .059, 10: .056, 11: .039, 13: .037, 14: .046, 15: .058, 16: .063, 17: .07, 18: .08 });
    expect(topHours(b)).toEqual([8, 17, 18]);
    expect(bestHoursLabel(b)).toBe('8時台・17〜18時台');
  });
  it('架電が少ない時間（150未満）は狙い目に入れない', () => {
    const b = { ...h({ 9: .05, 10: .04, 11: .03 }), 12: { rate: .2, calls: 40 } };
    expect(topHours(b)).toEqual([9, 10, 11]);
  });
});
