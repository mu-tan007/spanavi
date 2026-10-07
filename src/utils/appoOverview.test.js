import { describe, it, expect } from 'vitest';
import { isStale, todoCounts, weekDays, weekMeetings, staleFirst, shortCompany, TODO_RULES, throughBusinessDay } from './appoOverview';

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
  it('リスケ中は元の面談日が直近60日以内だけ', () => {
    expect(TODO_RULES.res({ status: 'リスケ中', meetDate: '2026-08-09' }, T)).toBe(true);
    expect(TODO_RULES.res({ status: 'リスケ中', meetDate: '2026-08-07' }, T)).toBe(false);
  });
  it('面談日を過ぎて状態がそのままのものだけを拾う', () => {
    expect(A.filter(a => isStale(a, T)).map(a => a.company)).toEqual(['A']);
  });
  it('カード3つを数える（本日の事前確認・リスケ中・キャンセル）', () => {
    expect(todoCounts(A, T)).toEqual({ today_pre: 0, cancel: 1, res: 1 });
  });
  it('本日の事前確認は面談が当日〜2営業日後でアポ取得のまま（土日は数えない）', () => {
    expect(throughBusinessDay('2026-10-07', 2)).toBe('2026-10-09'); // 水→金
    expect(throughBusinessDay('2026-10-08', 2)).toBe('2026-10-12'); // 木→月（間の土日は含める）
    expect(TODO_RULES.today_pre({ status: 'アポ取得', meetDate: '2026-10-09' }, T)).toBe(true);
    expect(TODO_RULES.today_pre({ status: 'アポ取得', meetDate: '2026-10-12' }, T)).toBe(false);
    expect(TODO_RULES.today_pre({ status: '事前確認済', meetDate: '2026-10-08' }, T)).toBe(false);
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
