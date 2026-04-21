import React from 'react';
import { C } from '../../../constants/colors';

export default function DealsLostTab({ deals }) {
  const lost = deals.filter(d => d.closed_status === 'lost');
  const reasonCounts = lost.reduce((acc, d) => {
    const r = d.lost_reason || '未記入';
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});

  const thStyle = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: C.navy, fontSize: 11, letterSpacing: '0.04em' };
  const tdStyle = { padding: '10px 12px', fontSize: 12, color: C.textDark };

  return (
    <div style={{ padding: 20, background: C.offWhite, minHeight: '100%' }}>
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          失注理由別件数
        </h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(reasonCounts).map(([reason, count]) => (
            <div key={reason} style={{
              padding: '10px 14px', background: C.white, border: `1px solid ${C.border}`,
              borderRadius: 4, minWidth: 120,
            }}>
              <div style={{ color: C.textMid, fontSize: 10, marginBottom: 2 }}>{reason}</div>
              <div style={{ fontWeight: 700, color: C.navy, fontSize: 20, fontFamily: "'JetBrains Mono',monospace" }}>{count}<span style={{ fontSize: 11, marginLeft: 3, color: C.textMid }}>件</span></div>
            </div>
          ))}
          {Object.keys(reasonCounts).length === 0 && (
            <div style={{ color: C.textLight, fontSize: 12 }}>失注Dealはまだありません</div>
          )}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          失注Deal一覧（{lost.length}件）
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: C.white, border: `1px solid ${C.border}`, borderRadius: 4 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.cream }}>
              <th style={thStyle}>企業名</th>
              <th style={thStyle}>失注理由</th>
              <th style={thStyle}>クライアント</th>
              <th style={thStyle}>失注日</th>
            </tr>
          </thead>
          <tbody>
            {lost.map(deal => (
              <tr key={deal.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={tdStyle}>{deal.prospect_company || deal.prospect_name || '-'}</td>
                <td style={{ ...tdStyle, color: C.textMid }}>{deal.lost_reason || '未記入'}</td>
                <td style={{ ...tdStyle, color: C.textMid }}>{deal.client?.name || '-'}</td>
                <td style={{ ...tdStyle, color: C.textMid, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                  {deal.closed_at ? new Date(deal.closed_at).toLocaleDateString('ja-JP') : '-'}
                </td>
              </tr>
            ))}
            {lost.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight, fontSize: 12 }}>失注Dealはまだありません</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
