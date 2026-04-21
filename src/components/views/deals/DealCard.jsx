import React, { useState } from 'react';
import { C } from '../../../constants/colors';

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function DealCard({ deal, stages, onClick, onStageChange }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const days = daysSince(deal.stage_changed_at);
  const stuck = days > 7 && deal.closed_status === 'open';

  const handleMenuClick = (e) => { e.stopPropagation(); setMenuOpen(v => !v); };
  const handleSelect = (e, stageId) => {
    e.stopPropagation();
    if (stageId !== deal.stage) onStageChange(stageId);
    setMenuOpen(false);
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        padding: '8px 10px',
        fontSize: 11,
        cursor: 'pointer',
        position: 'relative',
        boxShadow: '0 1px 2px rgba(3,45,96,0.04)',
      }}
    >
      <div style={{ fontWeight: 600, color: C.navy, marginBottom: 3, lineHeight: 1.3 }}>
        {deal.prospect_company || deal.prospect_name || '（名称未設定）'}
      </div>
      <div style={{ color: C.textMid, fontSize: 10, marginBottom: 4 }}>
        {deal.client?.name && <span>{deal.client.name}</span>}
        {deal.appointment?.appointment_date && (
          <span> · {new Date(deal.appointment.appointment_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</span>
        )}
      </div>
      {stuck && (
        <div style={{ fontSize: 10, color: C.red, marginBottom: 4, fontWeight: 500 }}>
          滞留 {days}日
        </div>
      )}
      <button
        type="button"
        onClick={handleMenuClick}
        style={{
          width: '100%',
          fontSize: 9,
          color: C.textMid,
          marginTop: 4,
          padding: '3px 6px',
          background: C.offWhite,
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          cursor: 'pointer',
          fontFamily: "'Noto Sans JP',sans-serif",
        }}
      >ステージ変更 ▾</button>
      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 4,
            boxShadow: '0 4px 12px rgba(3,45,96,0.12)', maxHeight: 240, overflowY: 'auto',
          }}
        >
          {stages.map(stage => (
            <div
              key={stage.id}
              onClick={e => handleSelect(e, stage.id)}
              style={{
                padding: '6px 10px', fontSize: 10, cursor: 'pointer',
                background: stage.id === deal.stage ? C.offWhite : 'transparent',
                color: stage.is_terminal
                  ? (stage.id === 'closed_won' ? C.green : C.red)
                  : C.navy,
                fontWeight: stage.id === deal.stage ? 600 : 400,
              }}
              onMouseEnter={e => { if (stage.id !== deal.stage) e.currentTarget.style.background = C.offWhite; }}
              onMouseLeave={e => { if (stage.id !== deal.stage) e.currentTarget.style.background = 'transparent'; }}
            >
              {stage.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
