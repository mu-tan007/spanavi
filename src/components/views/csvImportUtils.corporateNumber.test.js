import { describe, it, expect } from 'vitest';
import { detectField, normalizeCorporateNumber, buildRowsFromMapping, buildDefaultMapping } from './csvImportUtils';

describe('法人番号・IDの取込', () => {
  it('見出しから法人番号とIDを自動で割り当てる', () => {
    expect(detectField('法人番号')).toBe('corporate_number');
    expect(detectField('企業ID')).toBe('client_ref_id');
    expect(detectField('ID')).toBe('client_ref_id');
    expect(detectField('No.')).toBe('no'); // 連番は今まで通り
  });

  it('全角や区切り入りの13桁を揃え、壊れた値はそのまま残す', () => {
    expect(normalizeCorporateNumber('６１０００ ０１００９４９５')).toBe('6100001009495');
    expect(normalizeCorporateNumber('6100-0010-09495')).toBe('6100001009495');
    expect(normalizeCorporateNumber('4.01E+12')).toBe('4.01E+12');
    expect(normalizeCorporateNumber('')).toBeNull();
  });

  it('行に corporate_number と client_ref_id が乗り、memo には残らない', () => {
    const headers = ['No', '企業名', '法人番号', 'ID', '電話番号'];
    const dataRows = [['1', '株式会社アップル運輸', '6100001009495', 'LV-0001', '03-1234-5678']];
    const { mapping, units } = buildDefaultMapping(headers, dataRows);
    const rows = buildRowsFromMapping(dataRows, headers, mapping, units);
    expect(rows).toHaveLength(1);
    expect(rows[0].corporate_number).toBe('6100001009495');
    expect(rows[0].client_ref_id).toBe('LV-0001');
    // 紐付け済みの列は memo（未マッピング列の受け皿）に残らない
    expect(rows[0].memo || '').not.toMatch(/法人番号|LV-0001/);
  });
});
