import { describe, expect, it } from 'vitest';
import { MEET_TIME_OPTIONS } from './meetTimeOptions';

describe('MEET_TIME_OPTIONS', () => {
  it('9:00〜20:00を15分刻みで出す（13:15 を選べる）', () => {
    expect(MEET_TIME_OPTIONS[0]).toBe('09:00');
    expect(MEET_TIME_OPTIONS.at(-1)).toBe('20:00');
    expect(MEET_TIME_OPTIONS).toContain('13:15');
    expect(MEET_TIME_OPTIONS).toHaveLength(45);
  });
});
