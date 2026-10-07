import { describe, it, expect } from 'vitest';
import { headsByHour, gapHours, inShift, outsideShiftCalls, weekOf, daySummary } from './shiftInsights';

// 10/7 の実際のシフトの一部
const D = [
  { member_id: 'kitagawa', start_time: '08:00:00', end_time: '18:00:00', shift_date: '2026-10-07' },
  { member_id: 'okimura', start_time: '15:00:00', end_time: '19:00:00', shift_date: '2026-10-07' },
  { member_id: 'asai', start_time: '18:00:00', end_time: '19:00:00', shift_date: '2026-10-07' },
  { member_id: 'ogawa', start_time: '08:30:00', end_time: '09:30:00', shift_date: '2026-10-07' },
  { member_id: 'ogawa', start_time: '16:00:00', end_time: '18:00:00', shift_date: '2026-10-07' },
];

describe('shiftInsights', () => {
  it('時間ごとの人数（同じ人の2本は1人）', () => {
    const h = headsByHour(D, [8, 9, 16, 18]);
    expect(h).toEqual({ 8: 2, 9: 2, 16: 3, 18: 2 });
  });
  it('つながりやすいのに人が少ない時間（件数の少ない時間は外す）', () => {
    const rates = { 8: { rate: 7.2, calls: 4871 }, 12: { rate: 8.7, calls: 448 }, 16: { rate: 5.8, calls: 7208 }, 18: { rate: 8.6, calls: 3398 } };
    expect(gapHours(rates, { 8: 3, 12: 0, 16: 3, 18: 2 })).toEqual([18]);
  });
  it('30分以上の重なりでシフト中とみなす', () => {
    expect(inShift([D[0]], 17)).toBe(true);
    expect(inShift([D[0]], 18)).toBe(false);
    expect(inShift([D[3]], 10)).toBe(false);
    expect(inShift([D[3]], 8)).toBe(true);
  });
  it('シフトの外の架電を拾う', () => {
    const out = outsideShiftCalls(
      { 北川: { 9: 37, 18: 69 }, 浅井: { 13: 14, 16: 12, 18: 3 } },
      { 北川: [D[0]], 浅井: [D[2]] },
    );
    expect(out).toEqual({ 北川: { hours: [18], calls: 69 }, 浅井: { hours: [13, 16], calls: 26 } });
  });
  it('週の月〜土', () => {
    expect(weekOf('2026-10-07').map(d => d.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
    expect(weekOf('2026-10-11')[0].date).toBe('2026-10-05');
    expect(weekOf('2026-11-02')[0]).toMatchObject({ date: '2026-11-02', dow: '月' });
  });
  it('1日の人数と時間', () => {
    expect(daySummary(D, '2026-10-07')).toEqual({ people: 4, hours: 18 });
  });
});
