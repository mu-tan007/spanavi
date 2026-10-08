import { describe, it, expect } from 'vitest';
import { briefFileName, shortCorpName } from './briefPdf';

describe('1枚資料のファイル名', () => {
  it('ご面談前資料_社名_日付。株式会社は(株)・有限会社は(有)、括弧は半角', () => {
    expect(briefFileName({ company: '（有）笠井畜産' }, '2026/10/08')).toBe('ご面談前資料_(有)笠井畜産_20261008.pdf');
    expect(briefFileName({ company: '株式会社　田畑油商会' }, '2026/10/08')).toBe('ご面談前資料_(株)田畑油商会_20261008.pdf');
    expect(shortCorpName('キセイ　株式会社')).toBe('キセイ(株)');
  });
});
