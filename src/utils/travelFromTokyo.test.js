import { describe, it, expect } from 'vitest';
import { travelFromTokyo, travelLabel } from './travelFromTokyo';

describe('東京からの移動時間の目安', () => {
  it('都道府県と市区町村を読む', () => {
    expect(travelFromTokyo('大阪府大阪市北区堂島2丁目')).toEqual({ pref: '大阪府', city: '大阪市', hours: 3, means: '新幹線' });
    expect(travelLabel('大阪府大阪市北区堂島2丁目')).toBe('大阪府大阪市 ・ 東京から片道 約3時間（新幹線）');
  });
  it('30分刻みも読める形にする', () => {
    expect(travelLabel('福岡県福岡市博多区')).toBe('福岡県福岡市 ・ 東京から片道 約3時間30分（飛行機）');
    expect(travelLabel('東京都港区赤坂')).toBe('東京都港区 ・ 東京から片道 約30分（電車）');
  });
  it('東京の多摩は区部より遠い・郵便番号が先頭にあっても読む', () => {
    expect(travelFromTokyo('〒190-0001 東京都立川市若葉町').hours).toBe(1);
  });
  it('住所が無い・読めないときは出さない', () => {
    expect(travelFromTokyo('')).toBeNull();
    expect(travelLabel('不明')).toBeNull();
  });
});
