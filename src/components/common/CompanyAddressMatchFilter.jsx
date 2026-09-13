import React from 'react';
import { Select } from '../ui';
import { color, space, font } from '../../constants/design';
import { ADDRESS_MATCH_OPTIONS } from '../../utils/companyAddressMatch';

export default function CompanyAddressMatchFilter({ value, onChange }) {
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
        options={ADDRESS_MATCH_OPTIONS}
        containerStyle={{ minWidth: 108 }}
        style={{ fontSize: font.size.xs, background: value ? color.infoSoft : color.white }}
      />
    </label>
  );
}
