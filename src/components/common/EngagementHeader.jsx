import React, { useState } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow } from '../../constants/design';
import { Button } from '../ui';
import { useEngagements } from '../../hooks/useEngagements';
import { useAccessControl } from '../../hooks/useAccessControl';

// product slug 単位で「サイドバーが切り替わる対象」と「準備中」を判定する。
// product → 代表 engagement に切替する（業務種別単位ではなく事業単位でナビゲーション）。
const SWITCHABLE_PRODUCT_SLUGS = new Set(['sales_agency', 'spartia_career_biz', 'spartia_capital_biz']);
const READY_PRODUCT_SLUGS      = new Set(['sales_agency', 'spartia_career_biz', 'spartia_capital_biz']);

// product slug → 配下の代表 engagement slug
const PRODUCT_TO_PRIMARY_ENG_SLUG = {
  sales_agency:           'seller_sourcing',
  spartia_career_biz:     'spartia_career',
  spartia_recruitment_biz:'spartia_recruitment',
  spanavi_biz:            'spanavi',
  spartia_capital_biz:    'spartia_capital',
};

// inline=true のとき: 外側の position:fixed コンテナを出さず、タブ列だけ返す。
// (SpanaviApp のトップヘッダー内に埋め込んで使う)
export default function EngagementHeader({ isMobile = false, onEngagementChange, inline = false }) {
  const { engagements, products, currentEngagement, switchEngagement } = useEngagements();
  const { canViewEngagement } = useAccessControl();
  const [comingSoon, setComingSoon] = useState(null);

  if (!engagements.length) return null;

  // 全 products を、表示順で並べる
  // 各 product の表示可否は配下の代表 engagement に対する canViewEngagement で判定
  const items = (products || []).map(p => ({
    kind: 'product', id: p.id, slug: p.slug, name: p.name, display_order: p.display_order || 0,
  })).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const sorted = items.filter(item => {
    const engSlug = PRODUCT_TO_PRIMARY_ENG_SLUG[item.slug];
    return engSlug ? canViewEngagement(engSlug) : false;
  });

  if (sorted.length === 0) return null;

  // 現在選択中の item を判定（product は配下の代表engagement）
  const currentItemId = (() => {
    const p = (products || []).find(p => p.id === currentEngagement?.product_id);
    return p?.id || null;
  })();

  const handleTabClick = (item) => {
    if (SWITCHABLE_PRODUCT_SLUGS.has(item.slug)) {
      const engSlug = PRODUCT_TO_PRIMARY_ENG_SLUG[item.slug];
      if (engSlug) {
        switchEngagement(engSlug);
        const eng = engagements.find(e => e.slug === engSlug);
        onEngagementChange?.(eng || { slug: engSlug });
      }
    } else {
      setComingSoon(item);
    }
  };

  const tabsRow = (
    <div style={{ display: 'flex', alignSelf: 'stretch', gap: 2, height: '100%', alignItems: 'stretch' }}>
          {sorted.map((item) => {
            const active = currentItemId === item.id;
            const ready = item.kind === 'masp' ? true : READY_PRODUCT_SLUGS.has(item.slug);
            const isMasp = item.kind === 'masp';
            return (
              <React.Fragment key={item.id}>
                <button
                  type="button"
                  onClick={() => handleTabClick(item)}
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
                  {item.name}
                  {!ready && !isMasp && (
                    <span style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: radius.sm,
                      background: color.offWhite, color: color.textLight, fontWeight: font.weight.medium,
                    }}>準備中</span>
                  )}
                </button>
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
            <div style={{ fontSize: font.size.xs - 1, color: color.textLight, letterSpacing: font.letterSpacing.wider, textTransform: 'uppercase', marginBottom: 6 }}>SPANAVI</div>
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
