import { describe, it, expect } from 'vitest';
import { formatDateWithWeekday } from './dateUtils';

describe('formatDateWithWeekday', () => {
  it('appends Japanese weekday in parentheses for valid YYYY-MM-DD', () => {
    expect(formatDateWithWeekday('2026-05-25')).toBe('2026-05-25（月）');
    expect(formatDateWithWeekday('2026-06-01')).toBe('2026-06-01（月）');
    expect(formatDateWithWeekday('2026-05-24')).toBe('2026-05-24（日）');
    expect(formatDateWithWeekday('2026-05-23')).toBe('2026-05-23（土）');
  });

  it('returns empty string for empty/null input', () => {
    expect(formatDateWithWeekday('')).toBe('');
    expect(formatDateWithWeekday(null)).toBe('');
    expect(formatDateWithWeekday(undefined)).toBe('');
  });

  it('returns the original string for non-ISO date formats', () => {
    expect(formatDateWithWeekday('2026/05/25')).toBe('2026/05/25');
    expect(formatDateWithWeekday('not-a-date')).toBe('not-a-date');
    expect(formatDateWithWeekday('2026-5-1')).toBe('2026-5-1');
  });
});
