import React from 'react';
import { C } from '../../constants/colors';

// 0-100%=1周目、101-200%=2周目、201-300%=3周目、301-400%=4周目、401%以降=5周目以降
export function progressRoundInfo(pct) {
  const p = Math.round(pct || 0);
  const round = p <= 100 ? 1 : Math.ceil(p / 100);
  const palette = {
    1: { color: '#8A6D1F', bg: '#FFFBEB', border: '#D4A01788' }, // 1周目: ゴールド
    2: { color: '#2E844A', bg: '#ECFDF5', border: '#2E844A55' }, // 2周目: 緑
    3: { color: '#1E40AF', bg: '#EFF6FF', border: '#1E40AF55' }, // 3周目: 青
    4: { color: C.navy,    bg: '#EEF2FA', border: `${C.navy}55`}, // 4周目: ネイビー
  };
  const style = palette[round] || { color: '#6B7280', bg: '#F3F4F6', border: '#9CA3AF55' }; // 5周目〜: 灰
  return { pct: p, round, ...style };
}

// 進捗率のPill（Lists テーブルと同じ見た目。両方で共通利用）
export function ProgressPill({ pct }) {
  const { pct: p, color, bg, border } = progressRoundInfo(pct);
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, color, background: bg,
      padding: '2px 8px', borderRadius: 3, fontFamily: "'JetBrains Mono', monospace",
      border: `1px solid ${border}`, whiteSpace: 'nowrap',
    }}>{p}%</span>
  );
}

// Listsページ、Dashboard の「現在のおすすめリスト」で使う共通カードUI
export default function TopListCard({ list, onClick }) {
  const score = list.recommendation?.score || 0;
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', background: C.white, border: `1px solid ${C.border}`,
      borderRadius: 6, padding: '12px 14px', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 6, position: 'relative',
      borderTop: `3px solid ${C.gold}`, transition: 'box-shadow 0.15s',
      fontFamily: "'Noto Sans JP', sans-serif",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(13,34,71,0.12)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 9, color: C.textLight, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        <span>{list.industry || '—'}</span>
        <span style={{ color: C.gold, fontWeight: 700 }}>SCORE {score}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, lineHeight: 1.3 }}>
        {list.company || list.name || '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 10, color: C.textMid }}>
          {list.count ? `${list.count.toLocaleString()}件` : ''}
        </span>
        <ProgressPill pct={list.call_progress_pct} />
      </div>
    </button>
  );
}
