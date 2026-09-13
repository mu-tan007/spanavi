import { describe, expect, it } from 'vitest';
import { specificCompanyImportField } from './companyMasterImportMapping';
import { parseDelimitedText } from '../components/views/csvImportUtils';
import { getEffectiveCompanyAddressMatch } from './companyAddressMatch';

describe('企業情報を失わない取込と共有住所の反映', () => {
  it('自宅住所・法人番号・年齢を会社住所や代表者名に割り当てない', () => {
    expect(specificCompanyImportField('代表者現住所')).toBe('representative_address');
    expect(specificCompanyImportField('代表者自宅住所')).toBe('representative_address');
    expect(specificCompanyImportField('法人番号')).toBe('corporate_number');
    expect(specificCompanyImportField('代表者年齢')).toBe('representative_age');
    expect(specificCompanyImportField('代表者生年月日')).toBe('');
    expect(specificCompanyImportField('会社住所')).toBe(null);
  });
  it('引用した住所・メモの改行を別会社の行として扱わない', () => {
    expect(parseDelimitedText('会社名,住所,備考\r\n"A","東京都\n千代田区1-1","""確認済み"""\r\nB,大阪府1-1,')).toEqual([
      ['会社名','住所','備考'], ['A','東京都\n千代田区1-1','"確認済み"'], ['B','大阪府1-1',''],
    ]);
    expect(parseDelimitedText('会社名\t住所\nA\t東京都1-1', '\t')).toEqual([['会社名','住所'],['A','東京都1-1']]);
    expect(() => parseDelimitedText('A,"閉じていない')).toThrow();
  });
  it('自宅住所がないリスト行でも共有先を比較したサーバー結果を使う', () => {
    expect(getEffectiveCompanyAddressMatch({ company_id: 'verified', shared_address_match: 'same', memo: '{}' })).toBe('same');
    expect(getEffectiveCompanyAddressMatch({ company_id: 'verified', shared_address_match: 'bad' })).toBe('unknown');
    expect(getEffectiveCompanyAddressMatch({ shared_address_match: 'same' })).toBe('unknown');
  });
});
