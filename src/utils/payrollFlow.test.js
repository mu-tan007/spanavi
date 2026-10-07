import { describe, it, expect } from 'vitest';
import { defaultPayrollMonth, payrollFlow } from './payrollFlow';

const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({ label: `${m}月`, year: 2026, month: m }));

describe('payrollFlow', () => {
  it('開いたときは先月', () => {
    expect(defaultPayrollMonth(MONTHS, '2026-10-07')).toBe('9月');
    expect(defaultPayrollMonth(MONTHS, '2026-03-02')).toBe('12月');
  });
  it('9月分を10/7に見ると、請求書を集めている段', () => {
    const f = payrollFlow({ year: 2026, month: 9, today: '2026-10-07', isConfirmed: false, submitted: 3, payees: 10 });
    expect(f.steps.map(s => [s.sub, s.state])).toEqual([['9/30', 'done'], ['3 / 10人', 'cur'], ['10/20', ''], ['10/31', '']]);
    expect(f.headline).toBe('請求書を集めている');
  });
  it('締め前・確定後・振込後', () => {
    expect(payrollFlow({ year: 2026, month: 10, today: '2026-10-07', isConfirmed: false, submitted: 0, payees: 8 }).steps[0].state).toBe('cur');
    const fixed = payrollFlow({ year: 2026, month: 9, today: '2026-10-25', isConfirmed: true, submitted: 10, payees: 10 });
    expect(fixed.steps.map(s => s.state)).toEqual(['done', 'done', 'done', 'cur']);
    expect(payrollFlow({ year: 2026, month: 8, today: '2026-10-07', isConfirmed: true, submitted: 9, payees: 9 }).headline).toBe('振込まで終わった月');
  });
  it('12月分は翌年1月に確定・振込', () => {
    const f = payrollFlow({ year: 2026, month: 12, today: '2027-01-05', isConfirmed: false, submitted: 0, payees: 5 });
    expect(f.steps.map(s => s.sub)).toEqual(['12/31', '0 / 5人', '1/20', '1/31']);
  });
});
