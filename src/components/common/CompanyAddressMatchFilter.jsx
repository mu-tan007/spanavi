import React from 'react';
import { Button, Select } from '../ui';
import { color, space, font } from '../../constants/design';
import { ADDRESS_MATCH_OPTIONS } from '../../utils/companyAddressMatch';

export default function CompanyAddressMatchFilter({ value, onChange, counts }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[1], color: color.textMid, fontSize: font.size.xs }}>
      <span style={{ whiteSpace: 'nowrap' }}>会社住所と代表者自宅住所</span>
      <Select
        size="sm"
        fullWidth={false}
        aria-label="会社住所と代表者自宅住所"
        title="登録住所の空白・全角半角・番地表記を揃えて比較します。住所不足は判定不可です。"
        value={value}
        onChange={event => onChange(event.target.value)}
        options={ADDRESS_MATCH_OPTIONS.map(option => ({
          ...option,
          label: option.value && Number.isInteger(counts?.[option.value])
            ? `${option.label}（${counts[option.value].toLocaleString()}件）` : option.label,
        }))}
        containerStyle={{ minWidth: 108 }}
        style={{ fontSize: font.size.xs, background: value ? color.infoSoft : color.white }}
      />
    </label>
  );
}

export function CompanyAddressMatchSummary({ counts, value, onChange }) {
  if (!counts || !['same', 'different', 'unknown'].every(key => Number.isInteger(counts[key]) && counts[key] >= 0)) return null;
  const noComparable = counts.same + counts.different === 0 && counts.unknown > 0;
  return (
    <div role="status" style={{ marginTop: space[1], color: color.textMid, fontSize: font.size.xs, lineHeight: font.lineHeight.relaxed }}>
      <div>リスト全体の住所判定：一致 {counts.same.toLocaleString()}件 ／ 不一致 {counts.different.toLocaleString()}件 ／ 判定不可 {counts.unknown.toLocaleString()}件</div>
      {noComparable && <div style={{ color: color.warn }}>比較できる住所データがありません。会社住所・代表者自宅住所の登録内容を確認してください。</div>}
      {counts.unknown > 0 && <div>住所不足などで「判定不可」の企業は、一致・不一致には含まれません。</div>}
      {noComparable && (value === 'same' || value === 'different') && (
        <div style={{ display: 'flex', gap: space[2], marginTop: space[1] }}>
          <Button variant="outline" size="sm" onClick={() => onChange('unknown')}>判定不可を表示</Button>
          <Button variant="ghost" size="sm" onClick={() => onChange('')}>住所条件を解除</Button>
        </div>
      )}
    </div>
  );
}
