import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { outlookOf, perAppoLabel, rateOf, segmentOf } from './appoOutlook';

const rates = {
  all: { 未架電: 0.0019, 受付再コール: 0.0099, キーマン不在: 0.0011 },
  seller_sourcing: { 未架電: 0.0017, 受付再コール: 0.008 },
  lead_generation_ifa: { 未架電: 0.0003, キーマン不在: 0 },
};

describe('あと何件でアポ1件', () => {
  it('区分の率を会社ごとに足して割る（例：未架電1000＋受付再コール100）', () => {
    const items = [...Array(1000).fill({ call_status: null }), ...Array(100).fill({ call_status: '受付再コール' })];
    const o = outlookOf(items, 'seller_sourcing', rates);
    expect(o.n).toBe(1100);
    expect(o.expected).toBeCloseTo(2.5, 5);
    expect(perAppoLabel(o)).toBe('約440件');
  });
  it('区分にその状態の行が無ければ all を使う／5区分以外は all', () => {
    expect(rateOf(rates, 'seller_sourcing', 'キーマン不在')).toBe(0.0011);
    expect(segmentOf('ma_buyer_dm')).toBe('all');
  });
  it('区分で実績0件の状態は0のまま（all に逃がさない）→「実績0件」', () => {
    const o = outlookOf([{ call_status: 'キーマン不在' }], 'lead_generation_ifa', rates);
    expect(o.expected).toBe(0);
    expect(perAppoLabel(o)).toBe('実績0件');
  });
  it('アポ獲得・除外は数えない／対象なしは —', () => {
    expect(outlookOf([{ call_status: 'アポ獲得' }], 'all', rates).n).toBe(0);
    expect(perAppoLabel({ n: 0, perAppo: null })).toBe('—');
  });
});
