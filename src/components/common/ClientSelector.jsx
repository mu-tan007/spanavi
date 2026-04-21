import React from 'react';
import { C } from '../../constants/colors';

export default function ClientSelector({ clients, selectedClientId, onSelect }) {
  return (
    <div style={{
      padding: '10px 20px',
      background: C.white,
      borderBottom: `1px solid ${C.border}`,
      display: 'flex', alignItems: 'center', gap: 12,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 10, color: C.textLight, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        fontFamily: "'Outfit','Noto Sans JP',sans-serif",
      }}>CLIENT</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <ClientChip active={selectedClientId === null} label="All" onClick={() => onSelect(null)} />
        {clients.map(c => (
          <ClientChip
            key={c.id}
            active={selectedClientId === c.id}
            label={c.name}
            onClick={() => onSelect(c.id)}
          />
        ))}
        {clients.length === 0 && (
          <span style={{ fontSize: 11, color: C.textLight, fontStyle: 'italic', marginLeft: 4 }}>
            対象クライアントがありません
          </span>
        )}
      </div>
    </div>
  );
}

function ClientChip({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: '4px 10px',
        background: active ? C.navy : 'transparent',
        color: active ? C.white : C.textMid,
        border: `1px solid ${active ? C.navy : C.border}`,
        borderRadius: 3,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontFamily: "'Noto Sans JP',sans-serif",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.offWhite; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
