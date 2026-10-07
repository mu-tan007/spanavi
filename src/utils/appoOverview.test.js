import { describe, it, expect } from 'vitest';
import { isStale, todoCounts, weekDays, weekMeetings, staleFirst, shortCompany, TODO_RULES } from './appoOverview';

const T = '2026-10-07';
const A = [
  { company: 'A', status: '事前確認済', meetDate: '2026-10-05', emailStatus: 'sent' },
  { company: 'B', status: 'アポ取得', meetDate: '2026-10-20', emailStatus: 'pending' },
  { company: 'C', status: 'リスケ中', meetDate: '2026-10-08', emailStatus: 'sent' },
  { company: 'D', status: 'キャンセル', meetDate: '2026-10-09', emailStatus: 'pending' },
  { company: 'E', status: '面談済', meetDate: '2026-10-01', emailStatus: 'pending' },
  { company: 'F', status: '事前確認済', meetDate: '2026-10-07', emailStatus: 'pending', meetTime: '13:00' },
  { company: 'G', status: '事前確認済', meetDate: '2026-10-07', emailStatus: 'sent', meetTime: '10:00' },
];

describe('appoOverview', () => {
  it('面談日を過ぎて状態がそのままのものだけを拾う', () => {
    expect(A.filter(a => isStale(a, T)).map(a => a.company)).toEqual(['A']);
  });
  it('やること4つを数える（キャンセル・面談済は報告未送信に入れない）', () => {
    expect(todoCounts(A, T)).toEqual({ unsent: 2, stale: 1, pre: 1, res: 1 });
    expect(A.filter(a => TODO_RULES.unsent(a, T)).map(a => a.company)).toEqual(['B', 'F']);
  });
  it('水曜は同じ週の月〜金、土日は次の週', () => {
    expect(weekDays(T).map(d => d.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(weekDays(T)[0]).toMatchObject({ label: '10/5', dow: '月' });
    expect(weekDays('2026-10-10')[0].date).toBe('2026-10-12');
    expect(weekDays('2026-10-11')[0].date).toBe('2026-10-12');
  });
  it('今週の面談を日ごとに時刻順で並べる', () => {
    const by = weekMeetings(A, weekDays(T));
    expect(by['2026-10-07'].map(a => a.company)).toEqual(['G', 'F']);
    expect(by['2026-10-09'].map(a => a.company)).toEqual(['D']);
  });
  it('過ぎたものを先頭に寄せ、残りの並びは保つ', () => {
    expect(staleFirst(A, T).map(a => a.company)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(staleFirst([A[1], A[0]], T).map(a => a.company)).toEqual(['A', 'B']);
  });
  it('社名の法人格を落とす', () => {
    expect(shortCompany('株式会社十字電子')).toBe('十字電子');
    expect(shortCompany('（株）水野鉄工所')).toBe('水野鉄工所');
  });
});
