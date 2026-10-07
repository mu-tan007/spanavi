import { describe, it, expect } from 'vitest';
import { timerexUrlOf, timerexEmbedUrl } from './TimeRexEmbed';

describe('TimeRex の埋め込み用URL', () => {
  it('予約URLの末尾に /embed を付ける', () => {
    expect(timerexEmbedUrl('https://timerex.net/s/sugiura_82e4_8e05/04f0a50d')).toBe('https://timerex.net/s/sugiura_82e4_8e05/04f0a50d/embed');
  });
  it('注意事項の行から、後ろの読点や（担当者名）を除いて拾う', () => {
    expect(timerexUrlOf('・https://timerex.net/s/shinoura_c6b5_f207/6f345387(篠浦様)')).toBe('https://timerex.net/s/shinoura_c6b5_f207/6f345387');
    expect(timerexUrlOf('https://timerex.net/s/m.harada_c6e9_2fb5/d07b0fc3,')).toBe('https://timerex.net/s/m.harada_c6e9_2fb5/d07b0fc3');
  });
  it('Spir や空の値は拾わない', () => {
    expect(timerexUrlOf('https://app.spirinc.com/t/abc/as/def/confirm')).toBeNull();
    expect(timerexEmbedUrl('')).toBeNull();
  });
});
