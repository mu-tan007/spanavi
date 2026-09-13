import { describe, expect, it } from 'vitest';
import { getCompanyAddressMatch, normalizeCompanyAddress, normalizeAddressMatchFilter } from './companyAddressMatch';
import { buildDefaultMapping, buildRowsFromMapping, normalizeHeader } from '../components/views/csvImportUtils';

const company = '東京都千代田区丸の内1-2-3';
const item = (home, address = company) => ({ address, memo: JSON.stringify({ '代表者現住所': home }) });

describe('取込済みの会社住所と代表者自宅住所を照合', () => {
  it.each([
    company,
    '東京都 千代田区 丸の内１－２－３',
    '東京都千代田区丸の内一丁目二番三号',
    '東京都千代田区丸の内1番地の2の3',
    '〒100-0000 東京都千代田区丸の内1ー2ー3 /',
  ])('住所表記を揃えて一致: %s', home => expect(getCompanyAddressMatch(item(home))).toBe('same'));

  it.each([null, '', '　', '不明', '－', 'N/A', '東京都', '東京都千代田区丸の内', '東京都千代田区丸の内1丁目', '131010000', '東京都千代田区丸の内1-●-●'])('不足情報は不一致にしない: %s', home => {
    expect(getCompanyAddressMatch(item(home))).toBe('unknown');
  });

  it('会社住所側の欠損も判定不可', () => {
    expect(getCompanyAddressMatch(item(company, ''))).toBe('unknown');
    expect(getCompanyAddressMatch({ address: company, memo: '{broken' })).toBe('unknown');
    expect(getCompanyAddressMatch({ address: company, memo: '会社と自宅が同じらしい' })).toBe('unknown');
  });

  it('別の番地・部屋番号を不一致にする', () => {
    expect(getCompanyAddressMatch(item('東京都千代田区丸の内1-2-4'))).toBe('different');
    expect(getCompanyAddressMatch(item(company + 'テストビル202号室', company + 'テストビル201号室'))).toBe('different');
    expect(getCompanyAddressMatch(item(company + '2号館', company + '2館'))).toBe('different');
  });

  it('地名と建物名の文字を削らない', () => {
    expect(normalizeCompanyAddress('東京都千代田区三番町1-2コーポ101号室')).toBe('東京都千代田区三番町1-2コーポ101号室');
  });

  it('住所コードを使わず、TSRの代表者住所詳細を比較する', () => {
    const row = { address: company, memo: JSON.stringify({ '代表者住所': '131010000', '代表者住所詳細': company }) };
    expect(getCompanyAddressMatch(row)).toBe('same');
    expect(JSON.parse(row.memo)['代表者住所']).toBe('131010000');
  });

  it('括弧付きの列名、JSONオブジェクト形式、矛盾する複数住所を扱う', () => {
    expect(getCompanyAddressMatch({ address: company, memo: { '代表者住所（詳細）': company } })).toBe('same');
    expect(getCompanyAddressMatch({ address: company, memo: { '代表者現住所': company, '代表者自宅住所': '大阪府大阪市中央区本町1-2-3' } })).toBe('unknown');
    expect(getCompanyAddressMatch({ address: company, memo: { '登記住所': company, '_note': company } })).toBe('unknown');
  });

  it('既存CSV/Excel共通インポートの未マッピング列から照合し、原文を保持する', () => {
    const headers = ['企業名', '住所', '代表者住所', '代表者住所詳細'].map(normalizeHeader);
    const home = '東京都千代田区丸の内１丁目２番３号';
    const rows = [['テスト企業', company, '131010000', home]];
    const { mapping, units } = buildDefaultMapping(headers, rows);
    const imported = buildRowsFromMapping(rows, headers, mapping, units)[0];
    expect(getCompanyAddressMatch(imported)).toBe('same');
    expect(JSON.parse(imported.memo)['代表者住所詳細']).toBe(home);
  });

  it('不正な絞り込み条件は指定なしに戻す', () => {
    expect(normalizeAddressMatchFilter('different')).toBe('different');
    expect(normalizeAddressMatchFilter('invalid')).toBe('');
  });
});
