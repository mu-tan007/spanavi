import { describe, it, expect } from 'vitest';
import { countWeekdays, statusOf, buildBehaviorGroups, pickNextStep, FALLBACK_BENCH } from './dashboardMetrics';

describe('countWeekdays', () => {
  it('2026-10-01(木)〜10-07(水) は平日5日', () => {
    expect(countWeekdays('2026-10-01', '2026-10-07')).toBe(5);
  });
  it('逆順や空は0', () => {
    expect(countWeekdays('2026-10-07', '2026-10-01')).toBe(0);
    expect(countWeekdays('', '2026-10-01')).toBe(0);
  });
});

describe('statusOf', () => {
  it('大きいほど良い項目', () => {
    expect(statusOf(25, 22.9, 4.8, true)).toBe('up');
    expect(statusOf(10, 22.9, 4.8, true)).toBe('near');
    expect(statusOf(0, 22.9, 4.8, true)).toBe('far');
  });
  it('小さいほど良い項目（シフト開始から最初の架電まで）', () => {
    expect(statusOf(10, 13, 35, false)).toBe('up');
    expect(statusOf(18, 13, 35, false)).toBe('near');
    expect(statusOf(40, 13, 35, false)).toBe('far');
  });
  it('記録なし・値なし', () => {
    expect(statusOf(null, 52, 24, true, false)).toBe('unrecorded');
    expect(statusOf(null, 52, 24, true)).toBe('none');
  });
});

describe('buildBehaviorGroups と pickNextStep', () => {
  // 興村さん 10/1〜7 の実データ
  const row = { calls: 355, keyman: 15, appo: 1, days: 4, lists: 5, recall50_pct: 0, start_first_med_min: 17.9, offshift_pct: 0, span_med_h: 3.45, max_consec_weekdays: 4, talk_med_sec: 118, talk_n: 4, mtg_attended: 4, mtg_total: 8 };
  const groups = buildBehaviorGroups(row, null, { fromDate: '2026-10-01', toDate: '2026-10-07' });
  const byKey = Object.fromEntries(groups.flatMap(g => g.items).map(i => [i.key, i]));

  it('目安が無いときは分析の値を使う', () => {
    expect(byKey.recall50_pct.up).toBe(FALLBACK_BENCH.top.recall50_pct);
  });
  it('稼働日数は平日の割合、リストは月に直す', () => {
    expect(byKey.days_pct.me).toBe(80);
    expect(byKey.lists_per_month.me).toBeCloseTo(21.4, 1);
  });
  it('キーマン→アポ率と MTG 出席率', () => {
    expect(byKey.keyman_appo_pct.me).toBeCloseTo(6.67, 1);
    expect(byKey.mtg_pct.me).toBe(50);
  });
  it('記録の無い2項目は unrecorded', () => {
    expect(byKey.reception_next_time_pct.status).toBe('unrecorded');
    expect(byKey.schedule_reach_pct.status).toBe('unrecorded');
  });
  it('次の一歩はシフト外の稼働を選ばず、差の一番大きいもの', () => {
    const step = pickNextStep(groups);
    expect(step.item.key).not.toBe('offshift_pct');
    expect(['recall50_pct', 'span_med_h']).toContain(step.item.key);
  });
});
