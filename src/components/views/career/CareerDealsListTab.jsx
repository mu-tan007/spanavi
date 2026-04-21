import React, { useState } from 'react';
import { C } from '../../../constants/colors';

export default function CareerDealsListTab({ deals, stages, onRowClick }) {
  const [sortField, setSortField] = useState('stage_changed_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const stageMap = stages.reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

  const sorted = [...deals].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (av === bv) return 0;
    const cmp = (av == null ? -1 : (bv == null ? 1 : (av > bv ? 1 : -1)));
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  const handleSort = (f) => {
    if (sortField === f) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortOrder('desc'); }
  };

  const ownerMemberOf = (deal) => {
    const s = stageMap[deal.stage];
    const owner = s?.owner;
    const m = owner === 'trainer' ? deal.trainer : owner === 'closer' ? deal.closer : deal.sourcer;
    return m?.name || '-';
  };

  const thStyle = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: C.navy, fontSize: 11, letterSpacing: '0.04em' };
  const tdStyle = { padding: '10px 12px', fontSize: 12, color: C.textDark };
  const arrow = (f) => sortField === f ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div style={{ padding: 16, overflowX: 'auto', background: C.offWhite, minHeight: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.cream }}>
            <th onClick={() => handleSort('prospect_name')} style={{ ...thStyle, cursor: 'pointer' }}>氏名{arrow('prospect_name')}</th>
            <th onClick={() => handleSort('stage')} style={{ ...thStyle, cursor: 'pointer' }}>ステージ{arrow('stage')}</th>
            <th style={thStyle}>チーム</th>
            <th style={thStyle}>担当</th>
            <th style={thStyle}>プラン</th>
            <th onClick={() => handleSort('stage_changed_at')} style={{ ...thStyle, cursor: 'pointer' }}>最終更新{arrow('stage_changed_at')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(deal => (
            <tr
              key={deal.id}
              onClick={() => onRowClick(deal)}
              style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.cream; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.white; }}
            >
              <td style={{ ...tdStyle, fontWeight: 500 }}>
                {deal.prospect_name || '-'}
                {deal.is_qualified === false && (
                  <span style={{ marginLeft: 6, fontSize: 9, color: C.red, fontWeight: 600 }}>無効</span>
                )}
              </td>
              <td style={{ ...tdStyle, color: C.textMid }}>{stageMap[deal.stage]?.label || deal.stage}</td>
              <td style={{ ...tdStyle, color: C.textMid }}>{deal.team?.name || '-'}</td>
              <td style={{ ...tdStyle, color: C.textMid }}>{ownerMemberOf(deal)}</td>
              <td style={{ ...tdStyle, color: C.textMid }}>{deal.plan?.name || '-'}</td>
              <td style={{ ...tdStyle, color: C.textMid, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                {deal.stage_changed_at ? new Date(deal.stage_changed_at).toLocaleDateString('ja-JP') : '-'}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight, fontSize: 12 }}>該当するDealはありません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
