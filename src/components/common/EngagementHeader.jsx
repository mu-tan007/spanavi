import React, { useState } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow } from '../../constants/design';
import { Button } from '../ui';
import { useEngagements } from '../../hooks/useEngagements';
import { useAccessControl } from '../../hooks/useAccessControl';

// タブ選択でサイドバーが切り替わる対象（実装済み or 枠だけ準備済み）
const SWITCHABLE_SLUGS = new Set(['masp', 'seller_sourcing', 'spartia_career', 'spartia_capital']);
// コンテンツまで完全に実装済みのもの（タグを出さない）
const READY_SLUGS = new Set(['masp', 'seller_sourcing', 'spartia_capital', 'spartia_career']);

// inline=true のとき: 外側の position:fixed コンテナを出さず、タブ列だけ返す。
// (SpanaviApp のトップヘッダー内に埋め込んで使う)
export default function EngagementHeader({ isMobile = false, onEngagementChange, inline = false }) {
  const { engagements, currentEngagement, switchEngagement } = useEngagements();
  const { canViewEngagement } = useAccessControl();
  const [comingSoon, setComingSoon] = useState(null);

  if (!engagements.length) return null;

  // 自分が見られる事業タブのみ表示。adminバイパスは canViewEngagement 内で処理。
  const sorted = [...engagements]
    .filter(e => canViewEngagement(e.slug))
    .sort((a, b) => a.display_order - b.display_order);

  if (sorted.length === 0) return null;

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
                    gap: space[1],
                    cursor: 'pointer',
                    fontSize: font.size.sm,
                    fontFamily: isMasp ? font.family.display + "," + font.family.sans : font.family.sans,
                    letterSpacing: isMasp ? font.letterSpacing.wider : 0,
                    fontWeight: active ? font.weight.semibold : (isMasp ? font.weight.semibold : font.weight.normal),
                    color: active ? color.navy : (ready ? color.textMid : color.textLight),
                    borderBottom: active ? `2px solid ${color.gold}` : '2px solid transparent',
                    marginBottom: -1,
                    whiteSpace: 'nowrap',
                    textTransform: isMasp ? 'uppercase' : 'none',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = color.navy; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = ready ? color.textMid : color.textLight; }}
                >
                  {eng.name}
                  {!ready && !isMasp && (
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: radius.sm,
                      background: color.offWhite, color: color.textLight, fontWeight: font.weight.medium,
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
    background: color.white,
    borderBottom: `1px solid ${color.border}`,
    display: 'flex',
    alignItems: 'stretch',
    padding: isMobile ? `0 ${space[2]}px` : `0 ${space[6]}px`,
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
              background: color.white, borderRadius: radius.xl, padding: `${space[8] - 4}px ${space[8]}px`,
              width: 360, maxWidth: `calc(100% - ${space[8]}px)`, textAlign: 'center',
              boxShadow: shadow.xl,
              borderTop: `3px solid ${color.gold}`,
            }}
          >
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, letterSpacing: font.letterSpacing.wider, textTransform: 'uppercase', marginBottom: 6 }}>MASP</div>
            <div style={{ fontSize: 18, fontWeight: font.weight.bold, color: color.navy, marginBottom: 10, fontFamily: font.family.display + "," + font.family.sans }}>
              {comingSoon.name}
            </div>
            <div style={{ fontSize: font.size.sm, color: color.textMid, lineHeight: font.lineHeight.relaxed, marginBottom: space[5] }}>
              この事業は現在準備中です。<br />順次リリース予定です。
            </div>
            <Button onClick={() => setComingSoon(null)} size="sm">閉じる</Button>
          </div>
        </div>
      )}
    </>
  );
}
