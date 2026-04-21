import React from 'react';
import { C } from '../../../constants/colors';

export default function DealsFunnelTab({ deals, stages }) {
  const total = deals.length;
  const open = deals.filter(d => d.closed_status === 'open').length;
  const won = deals.filter(d => d.closed_status === 'won').length;
  const lost = deals.filter(d => d.closed_status === 'lost').length;

  const stageCounts = stages.map(s => ({ ...s, count: deals.filter(d => d.stage === s.id).length }));
  const visibleStages = stageCounts.filter(s => !s.is_terminal || s.id === 'closed_won');
  const maxCount = Math.max(...visibleStages.map(s => s.count), 1);

  const card = (title, value, accent) => (
    <div style={{ padding: 14, background: accent?.bg || C.white, border: `1px solid ${accent?.border || C.border}`, borderRadius: 4 }}>
      <div style={{ fontSize: 10, color: accent?.textMid || C.textMid, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent?.text || C.navy, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: 20, background: C.offWhite, minHeight: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {card('総Deal数', total)}
        {card('進行中', open)}
        {card('成約', won, { bg: C.greenLight, border: C.green, text: C.green, textMid: C.green })}
        {card('成約率', total > 0 ? `${((won / total) * 100).toFixed(1)}%` : '-')}
      </div>

      <section>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          ステージ別Deal分布
        </h3>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, padding: '14px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleStages.map(stage => (
              <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, width: 180, color: C.textMid, flexShrink: 0 }}>
                  {stage.label}
                </span>
                <div style={{ flex: 1, height: 22, background: C.offWhite, borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', inset: `0 ${100 - (stage.count / maxCount) * 100}% 0 0`,
                    background: stage.id === 'closed_won' ? C.gold : C.navy,
                    borderRadius: 3, transition: 'all 0.3s',
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: C.navy }}>
                  {stage.count}
                </span>
              </div>
            ))}
          </div>
        </div>
        {lost > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: C.textMid }}>
            ※ 失注 {lost} 件は除外
          </div>
        )}
      </section>
    </div>
  );
}
