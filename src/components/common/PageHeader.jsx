import React from 'react';
import { color, space, font } from '../../constants/design';
import { useIsMobile } from '../../hooks/useIsMobile';

// Spanavi 全ページ共通のヘッダー帯。タイトル + 副題 (青文字) のシンプル構成。
// - title:   メインタイトル (Outfit, 20/600, navy)
// - description: 補足テキスト (11px, textMid)
// - right:   右側アクション (ボタン等)
// - bleed:   親の padding を相殺 (PC は -28、スマホは -12)。既定 true。
// - compact: 下余白を縮小 (タブバーが直下に来るページ用)。既定 false。
// - children: 帯の内側下部に追加要素 (検索 input / 小さいフィルタ等) を置く場合
// (eyebrow は廃止。後方互換のため prop は受け取るが描画しない)
export default function PageHeader({
  eyebrow, // eslint-disable-line no-unused-vars
  title,
  description,
  right,
  bleed = true,
  compact = false,
  children,
  style,
}) {
  // style の spread で margin 全体が上書きされないよう、個別プロパティに分解
  const { marginTop, marginBottom, marginLeft, marginRight, margin: _m, ...restStyle } = style || {};
  // 親 (SpanaviApp の main) の左右 padding と同じ幅だけはみ出させる。
  // スマホで -28 のままだと main の padding(12px) より 16px 広がり、右端が切れる
  const isMobile = useIsMobile();
  const bleedPx = bleed ? (isMobile ? -12 : -28) : 0;
  return (
    <div
      style={{
        padding: compact ? `${space[3] + 2}px ${space[5]}px 0` : `${space[3] + 2}px ${space[5]}px ${space[4]}px`,
        background: color.white,
        borderBottom: compact ? 'none' : `1px solid ${color.border}`,
        marginTop: marginTop ?? 0,
        marginRight: marginRight ?? bleedPx,
        marginBottom: marginBottom ?? 0,
        marginLeft: marginLeft ?? bleedPx,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: space[4],
        flexWrap: 'wrap',
        ...restStyle,
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <h1 style={{
          fontSize: font.size.xl, fontWeight: font.weight.semibold, margin: '0 0 2px',
          color: color.navy,
          fontFamily: `${font.family.display}, 'Noto Sans JP', sans-serif`,
        }}>
          {title}
        </h1>
        {description && (
          <p style={{
            fontSize: font.size.xs, color: color.textMid,
            margin: compact ? `0 0 ${space[3]}px` : '0 0 0',
          }}>
            {description}
          </p>
        )}
        {children}
      </div>
      {right && (
        // ボタンが多いとスマホ幅を越えるので折り返す（PCでは1行に収まるので見た目は変わらない）
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', maxWidth: '100%' }}>
          {right}
        </div>
      )}
    </div>
  );
}
