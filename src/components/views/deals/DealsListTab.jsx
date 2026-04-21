import React, { useState } from 'react';
import { C } from '../../../constants/colors';

export default function DealsListTab({ deals, stages, onRowClick }) {
  const [sortField, setSortField] = useState('stage_changed_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const stageLabelMap = stages.reduce((acc, s) => { acc[s.id] = s.label; return acc; }, {});

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

  const thStyle = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: C.navy, fontSize: 11, letterSpacing: '0.04em' };
  const tdStyle = { padding: '10px 12px', fontSize: 12, color: C.textDark };

  const renderArrow = (f) => sortField === f ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div style={{ padding: 16, overflowX: 'auto', background: C.offWhite, minHeight: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.cream }}>
            <th onClick={() => handleSort('prospect_company')} style={{ ...thStyle, cursor: 'pointer' }}>企業名{renderArrow('prospect_company')}</th>
            <th onClick={() => handleSort('stage')} style={{ ...thStyle, cursor: 'pointer' }}>ステージ{renderArrow('stage')}</th>
            <th style={thStyle}>クライアント</th>
            <th onClick={() => handleSort('stage_changed_at')} style={{ ...thStyle, cursor: 'pointer' }}>最終更新{renderArrow('stage_changed_at')}</th>
            <th style={thStyle}>担当</th>
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
              <td style={{ ...tdStyle, fontWeight: 500 }}>{deal.prospect_company || deal.prospect_name || '（名称未設定）'}</td>
              <td style={{ ...tdStyle, color: C.textMid }}>{stageLabelMap[deal.stage] || deal.stage}</td>
              <td style={{ ...tdStyle, color: C.textMid }}>{deal.client?.name || '-'}</td>
              <td style={{ ...tdStyle, color: C.textMid, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                {deal.stage_changed_at ? new Date(deal.stage_changed_at).toLocaleDateString('ja-JP') : '-'}
              </td>
              <td style={{ ...tdStyle, color: C.textMid }}>{deal.closer?.name || deal.sourcer?.name || '-'}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight, fontSize: 12 }}>該当するDealはありません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
