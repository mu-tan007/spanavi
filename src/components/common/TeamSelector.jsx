import React from 'react';
import { color, font, radius } from '../../constants/design';

export default function TeamSelector({ teams, selectedTeamId, onSelect }) {
  return (
    <div style={{
      padding: '10px 20px',
      background: color.white,
      borderBottom: `1px solid ${color.border}`,
      display: 'flex', alignItems: 'center', gap: 12,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 10, color: color.textLight, fontWeight: font.weight.bold,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        fontFamily: "'Outfit','Noto Sans JP',sans-serif",
      }}>TEAM</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Chip active={selectedTeamId === null} label="All" onClick={() => onSelect(null)} />
        {teams.map(t => (
          <Chip
            key={t.id}
            active={selectedTeamId === t.id}
            label={`${t.name}${t.active_members?.length ? `  (${t.active_members.length})` : ''}`}
            onClick={() => onSelect(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11, padding: '4px 10px',
        background: active ? color.navy : 'transparent',
        color: active ? color.white : color.textMid,
        border: `1px solid ${active ? color.navy : color.border}`,
        borderRadius: radius.sm,
        fontWeight: active ? font.weight.semibold : font.weight.normal,
        cursor: 'pointer',
        fontFamily: font.family.sans,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = color.offWhite; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
