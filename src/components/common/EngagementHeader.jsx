import React, { useEffect, useRef, useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';

const READY_SLUGS = new Set(['seller_sourcing']);

export default function EngagementHeader({ isMobile = false, onOpenDatabase }) {
  const { engagements, currentEngagement, switchEngagement } = useEngagements();
  const [comingSoon, setComingSoon] = useState(null);
  const [mspOpen, setMspOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMspOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!engagements.length) return null;

  const handleTabClick = (eng) => {
    if (READY_SLUGS.has(eng.slug)) switchEngagement(eng.slug);
    else setComingSoon(eng);
  };

  const barStyle = {
    position: 'fixed',
    top: isMobile ? 48 : 54,
    left: isMobile ? 0 : 220,
    right: 0,
    width: isMobile ? '100%' : 'calc(100% - 220px)',
    height: 36,
    zIndex: 140,
    background: '#FFFFFF',
    borderBottom: `1px solid ${C.border}`,
    display: 'flex',
    alignItems: 'stretch',
    padding: isMobile ? '0 8px' : '0 24px',
    boxSizing: 'border-box',
    overflowX: isMobile ? 'auto' : 'visible',
    whiteSpace: 'nowrap',
  };

  return (
    <>
      <div style={barStyle}>
        <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', marginRight: 18 }}>
          <button
            type="button"
            onClick={() => setMspOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
              fontSize: 10, fontWeight: 700, color: C.textMid, letterSpacing: '0.1em',
              textTransform: 'uppercase', fontFamily: "'Outfit','Noto Sans JP',sans-serif",
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            MASP
            <span style={{ fontSize: 8, color: C.textLight }}>▾</span>
          </button>
          {mspOpen && (
            <div style={{
              position: 'absolute', top: 34, left: 0, minWidth: 220,
              background: C.white, border: `1px solid ${C.border}`,
              borderRadius: 6, boxShadow: '0 6px 20px rgba(3,45,96,0.12)',
              padding: 6, zIndex: 400,
            }}>
              <button
                type="button"
                onClick={() => { setMspOpen(false); if (onOpenDatabase) onOpenDatabase(); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', fontSize: 12, fontWeight: 500,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: C.navy, borderRadius: 4,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.offWhite; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >Database（全社共有）</button>
              {['全社ダッシュボード', 'Members', 'Settings'].map(label => (
                <div key={label} style={{ padding: '8px 12px', fontSize: 12, color: C.textLight, cursor: 'not-allowed' }}>
                  {label}<span style={{ fontSize: 10, marginLeft: 6 }}>（準備中）</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ width: 1, height: 18, background: C.border, marginLeft: 12 }} />
        </div>

        <div style={{ display: 'flex', alignSelf: 'stretch', gap: 2 }}>
          {engagements.map(eng => {
            const active = currentEngagement?.id === eng.id;
            const ready = READY_SLUGS.has(eng.slug);
            return (
              <button
                key={eng.id}
                type="button"
                onClick={() => handleTabClick(eng)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '0 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: "'Noto Sans JP',sans-serif",
                  fontWeight: active ? 600 : 400,
                  color: active ? C.navy : (ready ? C.textMid : C.textLight),
                  borderBottom: active ? `2px solid ${C.gold}` : '2px solid transparent',
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.navy; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = ready ? C.textMid : C.textLight; }}
              >
                {eng.name}
                {!ready && (
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: C.offWhite, color: C.textLight, fontWeight: 500,
                  }}>準備中</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {comingSoon && (
        <div
          onClick={() => setComingSoon(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(3,45,96,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.white, borderRadius: 8, padding: '28px 32px',
              width: 360, maxWidth: 'calc(100% - 32px)', textAlign: 'center',
              boxShadow: '0 20px 60px rgba(3,45,96,0.25)',
              borderTop: `3px solid ${C.gold}`,
            }}
          >
            <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>MASP</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 10, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
              {comingSoon.name}
            </div>
            <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7, marginBottom: 20 }}>
              この事業は現在準備中です。<br />順次リリース予定です。
            </div>
            <button
              onClick={() => setComingSoon(null)}
              style={{
                padding: '8px 24px', background: C.navy, color: C.white, border: 'none',
                borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Noto Sans JP',sans-serif",
              }}
            >閉じる</button>
          </div>
        </div>
      )}
    </>
  );
}
