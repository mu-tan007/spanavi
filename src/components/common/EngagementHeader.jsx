import React, { useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';

// タブ選択でサイドバーが切り替わる対象（実装済み or 枠だけ準備済み）
const SWITCHABLE_SLUGS = new Set(['masp', 'seller_sourcing', 'spartia_career', 'spartia_capital']);
// コンテンツまで完全に実装済みのもの（タグを出さない）
const READY_SLUGS = new Set(['masp', 'seller_sourcing', 'spartia_capital']);

// inline=true のとき: 外側の position:fixed コンテナを出さず、タブ列だけ返す。
// (SpanaviApp のトップヘッダー内に埋め込んで使う)
export default function EngagementHeader({ isMobile = false, onEngagementChange, inline = false }) {
  const { engagements, currentEngagement, switchEngagement } = useEngagements();
  const [comingSoon, setComingSoon] = useState(null);

  if (!engagements.length) return null;

  const sorted = [...engagements].sort((a, b) => a.display_order - b.display_order);

  const handleTabClick = (eng) => {
    if (SWITCHABLE_SLUGS.has(eng.slug)) {
      switchEngagement(eng.slug);
      onEngagementChange?.(eng);
    } else {
      setComingSoon(eng);
    }
  };

  const tabsRow = (
    <div style={{ display: 'flex', alignSelf: 'stretch', gap: 2, height: '100%', alignItems: 'stretch' }}>
          {sorted.map((eng) => {
            const active = currentEngagement?.slug === eng.slug;
            const ready = READY_SLUGS.has(eng.slug);
            const isMasp = eng.slug === 'masp';
            return (
              <React.Fragment key={eng.id}>
                <button
                  type="button"
                  onClick={() => handleTabClick(eng)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: isMasp ? '0 14px 0 2px' : '0 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    fontSize: isMasp ? 12 : 12,
                    fontFamily: isMasp ? "'Outfit','Noto Sans JP',sans-serif" : "'Noto Sans JP',sans-serif",
                    letterSpacing: isMasp ? '0.08em' : 0,
                    fontWeight: active ? 600 : (isMasp ? 600 : 400),
                    color: active ? C.navy : (ready ? C.textMid : C.textLight),
                    borderBottom: active ? `2px solid ${C.gold}` : '2px solid transparent',
                    marginBottom: -1,
                    whiteSpace: 'nowrap',
                    textTransform: isMasp ? 'uppercase' : 'none',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.navy; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = ready ? C.textMid : C.textLight; }}
                >
                  {eng.name}
                  {!ready && !isMasp && (
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3,
                      background: C.offWhite, color: C.textLight, fontWeight: 500,
                    }}>準備中</span>
                  )}
                </button>
                {/* MASP と他事業の区切り線はトップヘッダー統合で不要になったため削除 */}
              </React.Fragment>
            );
          })}
    </div>
  );

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
      {inline ? tabsRow : <div style={barStyle}>{tabsRow}</div>}

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
