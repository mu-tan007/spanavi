import React from 'react';
import { C } from '../../constants/colors';

// Spanavi 全ページ共通のヘッダー帯。タイトル + 副題 (青文字) のシンプル構成。
// - title:   メインタイトル (Outfit, 20/600, navy)
// - description: 補足テキスト (11px, textMid)
// - right:   右側アクション (ボタン等)
// - bleed:   親の padding を相殺 (margin: -28)。既定 true。
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
  return (
    <div
      style={{
        padding: compact ? '14px 20px 0' : '14px 20px 16px',
        background: C.white,
        borderBottom: compact ? 'none' : `1px solid ${C.border}`,
        margin: bleed ? '-28px -28px 0' : 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        ...style,
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <h1 style={{
          fontSize: 20, fontWeight: 600, margin: '0 0 2px',
          color: C.navy,
          fontFamily: "'Outfit','Noto Sans JP',sans-serif",
        }}>
          {title}
        </h1>
        {description && (
          <p style={{
            fontSize: 11, color: C.textMid,
            margin: compact ? '0 0 12px' : '0 0 0',
          }}>
            {description}
          </p>
        )}
        {children}
      </div>
      {right && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {right}
        </div>
      )}
    </div>
  );
}
