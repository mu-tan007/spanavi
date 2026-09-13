import { describe, expect, it } from 'vitest';
import { normalizeSharedCompanyAddress, comparableSharedAddress } from './companyProfileIdentity';
import { buildProfileGroups } from '../../scripts/lib/companyProfileGroups.mjs';

describe('企業情報を共有する前の識別と住所照合', () => {
  it('原本の郵便番号とアンダースコアを除いて比較し、所在地から自宅の県を推測しない', () => {
    expect(normalizeSharedCompanyAddress('〒100-0001_東京都千代田区千代田１番１号')).toBe('東京都千代田区千代田1-1');
    expect(comparableSharedAddress('〒100-0001_東京都千代田区千代田１番１号')).toBe('東京都千代田区千代田1-1');
    expect(comparableSharedAddress('千代田区千代田1-1')).toBe('');
    expect(comparableSharedAddress('〒100-0001_東京都千代田区')).toBe('');
  });
  it('会社名だけでは同一企業にせず、複数のリストからの一致根拠を繋げる', () => {
    const { groups } = buildProfileGroups([
      { name: 'a', rawName: '株式会社A', phone: '0311111111' },
      { name: 'a', rawName: 'A(株)', phone: '0311111111', representative: '甲' },
      { name: 'a', rawName: '株式会社A', representative: '甲' },
      { name: 'a', rawName: '株式会社A', representative: '乙' },
    ]);
    expect(groups).toEqual([[0, 1, 2], [3]]);
  });
  it('法人番号が矛盾する連結グループでは同じ番号の組だけを共有する', () => {
    const { groups, reviews } = buildProfileGroups([
      { name: 'a', phone: '03', corp: '111' }, { name: 'a', phone: '03', corp: '222' },
      { name: 'a', phone: '03' }, { name: 'b', corp: '111' },
    ]);
    expect(groups).toEqual([[0, 3], [1], [2]]); expect(reviews).toHaveLength(1);
  });
  it('法人番号がない株式会社と合同会社を同じ代表者だけで混同しない', () => {
    const { groups, reviews } = buildProfileGroups([
      { name: 'a', rawName: '株式会社A', representative: '甲' },
      { name: 'a', rawName: '合同会社A', representative: '甲' },
    ]);
    expect(groups).toEqual([[0], [1]]); expect(reviews).toHaveLength(1);
  });
  it('一方にだけ法人番号があっても法人格の相違を無視しない', () => {
    expect(buildProfileGroups([
      { name: 'a', rawName: '株式会社A', representative: '甲', corp: '111' },
      { name: 'a', rawName: '合同会社A', representative: '甲' },
    ]).groups).toEqual([[0], [1]]);
  });
});
