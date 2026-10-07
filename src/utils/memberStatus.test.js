import { describe, it, expect } from 'vitest';
import { memberStatus, memberKpis, monthStartIso, nowJst } from './memberStatus';

// 2026-10-07 17:20（日本時間）
const NOW = new Date('2026-10-07T08:20:00Z');

describe('memberStatus', () => {
  it('日本時間の今日と分', () => {
    expect(nowJst(NOW)).toEqual({ date: '2026-10-07', min: 17 * 60 + 20 });
    expect(monthStartIso(NOW)).toBe('2026-09-30T15:00:00.000Z');
  });
  it('直近30分に架電があれば架電中', () => {
    expect(memberStatus({ lastCalledAt: '2026-10-07T08:00:00Z' }, NOW).label).toBe('架電中');
    expect(memberStatus({ lastCalledAt: '2026-10-07T07:30:00Z' }, NOW).kind).toBe('none');
  });
  it('シフト中・今日の次・次の日', () => {
    const sh = [
      { shift_date: '2026-10-07', start_time: '15:00:00', end_time: '19:00:00' },
      { shift_date: '2026-10-08', start_time: '08:00:00', end_time: '18:00:00' },
    ];
    expect(memberStatus({ shifts: sh }, NOW).label).toBe('シフト中 〜19:00');
    expect(memberStatus({ shifts: [{ shift_date: '2026-10-07', start_time: '18:00:00', end_time: '19:00:00' }] }, NOW).label).toBe('今日 18:00〜');
    expect(memberStatus({ shifts: [sh[1]] }, NOW).label).toBe('次 10/8 8:00〜');
    expect(memberStatus({ shifts: [] }, NOW).label).toBe('シフトなし');
  });
  it('上の段の数字（ほかの事業の人・自動除外は数えない）', () => {
    const k = memberKpis({
      members: [{ id: 'a', name: '北川 恭太郎' }, { id: 'b', name: '興村 重貴' }],
      stats: [
        { getter_name: '北川 恭太郎', calls: 820, keyman: 49, last_called_at: '2026-10-07T08:10:00Z' },
        { getter_name: '興村 重貴', calls: 479, keyman: 22, last_called_at: '2026-10-07T07:00:00Z' },
        { getter_name: '別事業の人', calls: 100, keyman: 50, last_called_at: '2026-10-07T08:19:00Z' },
      ],
      shifts: [
        { member_id: 'a', shift_date: '2026-10-07', start_time: '08:00:00', end_time: '18:00:00' },
        { member_id: 'b', shift_date: '2026-10-07', start_time: '15:00:00', end_time: '19:00:00' },
        { member_id: 'b', shift_date: '2026-10-08', start_time: '15:00:00', end_time: '19:00:00' },
      ],
      appos: [{ getter_name: '北川 恭太郎', intern_reward: 67760 }, { getter_name: '別事業の人', intern_reward: 1 }],
    }, NOW);
    expect(k).toEqual({ calling: ['北川 恭太郎'], shiftPeople: 2, shiftHours: 14, calls: 1299, keyman: 71, keymanRate: 5.5, appos: 1, reward: 67760 });
  });
});
