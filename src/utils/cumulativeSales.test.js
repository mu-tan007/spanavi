import { describe, it, expect } from 'vitest';
import { cumulativeSalesDelta, shouldBeCountedInCumulative } from './cumulativeSales';

describe('cumulativeSalesDelta（累計売上の増減）', () => {
  it('アポ取得 → 面談済 は新売上を加算', () => {
    expect(cumulativeSalesDelta({
      prevStatus: 'アポ取得', nextStatus: '面談済', prevSales: 110000, nextSales: 110000,
    })).toBe(110000);
  });

  it('面談済 → キャンセル は元売上を減算する', () => {
    expect(cumulativeSalesDelta({
      prevStatus: '面談済', nextStatus: 'キャンセル', prevSales: 165000, nextSales: 165000,
    })).toBe(-165000);
  });

  it('面談済 → リスケ中 も減算する', () => {
    expect(cumulativeSalesDelta({
      prevStatus: '面談済', nextStatus: 'リスケ中', prevSales: 220000, nextSales: 220000,
    })).toBe(-220000);
  });

  it('面談済 → アポ取得 に戻した場合も減算する', () => {
    expect(cumulativeSalesDelta({
      prevStatus: '面談済', nextStatus: 'アポ取得', prevSales: 77000, nextSales: 77000,
    })).toBe(-77000);
  });

  it('面談済のまま金額を修正したら差分だけ動く', () => {
    expect(cumulativeSalesDelta({
      prevStatus: '面談済', nextStatus: '面談済', prevSales: 110000, nextSales: 165000,
    })).toBe(55000);
    expect(cumulativeSalesDelta({
      prevStatus: '面談済', nextStatus: '面談済', prevSales: 165000, nextSales: 110000,
    })).toBe(-55000);
  });

  it('面談済が絡まない変更は0', () => {
    expect(cumulativeSalesDelta({
      prevStatus: 'アポ取得', nextStatus: 'キャンセル', prevSales: 110000, nextSales: 110000,
    })).toBe(0);
    expect(cumulativeSalesDelta({
      prevStatus: '事前確認済', nextStatus: 'リスケ中', prevSales: 110000, nextSales: 110000,
    })).toBe(0);
  });

  it('売上額が未設定でも壊れない', () => {
    expect(cumulativeSalesDelta({
      prevStatus: '面談済', nextStatus: 'キャンセル', prevSales: null, nextSales: null,
    })).toBe(0);
  });
});

describe('shouldBeCountedInCumulative（加算済みフラグ）', () => {
  it('面談済のときだけ true', () => {
    expect(shouldBeCountedInCumulative('面談済')).toBe(true);
    expect(shouldBeCountedInCumulative('キャンセル')).toBe(false);
    expect(shouldBeCountedInCumulative('アポ取得')).toBe(false);
    expect(shouldBeCountedInCumulative('リスケ中')).toBe(false);
  });
});
