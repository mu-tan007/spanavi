import React from 'react';
import { color, radius, space, shadow, font, transition } from '../../constants/design';

/**
 * Spanavi 共通カード
 *
 * @prop variant: 'default' | 'subtle' | 'elevated' | 'flat'
 * @prop padding: 'none' | 'sm' | 'md' | 'lg' (default 'md')
 * @prop interactive: boolean (hoverで lift)
 * @prop title, description, action: ヘッダー要素 (任意)
 */
const PADDING = {
  none: 0,
  sm: space[3],   // 12
  md: space[5],   // 20
  lg: space[6],   // 24
};

const VARIANT = {
  default:  { bg: color.white,    border: color.border,      shadow: shadow.sm },
  subtle:   { bg: color.cream,    border: color.borderLight, shadow: shadow.none },
  elevated: { bg: color.white,    border: 'transparent',     shadow: shadow.md },
  flat:     { bg: color.white,    border: color.border,      shadow: shadow.none },
};

export default function Card({
  variant = 'default',
  padding = 'md',
  interactive = false,
  title,
  description,
  action,
  style,
  headerStyle,
  bodyStyle,
  children,
  onClick,
  ...rest
}) {
  const v = VARIANT[variant] || VARIANT.default;
  const pad = PADDING[padding] ?? PADDING.md;

  const hasHeader = title || description || action;

  return (
    <div
      onClick={onClick}
      style={{
        background: v.bg,
        border: `1px solid ${v.border === 'transparent' ? 'transparent' : v.border}`,
        borderRadius: radius.lg,
        boxShadow: v.shadow,
        cursor: onClick || interactive ? 'pointer' : undefined,
        transition: interactive
          ? `transform ${transition.fast}, box-shadow ${transition.base}`
          : undefined,
        boxSizing: 'border-box',
        ...style,
      }}
      onMouseEnter={e => {
        if (interactive) {
          e.currentTarget.style.boxShadow = shadow.hoverLift;
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        if (interactive) {
          e.currentTarget.style.boxShadow = v.shadow;
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
      {...rest}
    >
      {hasHeader && (
        <div style={{
          padding: pad === 0 ? 0 : `${pad}px ${pad}px ${pad - 4}px`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: space[3],
          borderBottom: children ? `1px solid ${color.borderLight}` : 'none',
          ...headerStyle,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <div style={{
                fontSize: font.size.md,
                fontWeight: font.weight.semibold,
                color: color.textDark,
                lineHeight: font.lineHeight.tight,
              }}>
                {title}
              </div>
            )}
            {description && (
              <div style={{
                fontSize: font.size.sm,
                color: color.textMid,
                marginTop: 4,
                lineHeight: font.lineHeight.normal,
              }}>
                {description}
              </div>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children !== undefined && (
        <div style={{ padding: pad === 0 ? 0 : pad, ...bodyStyle }}>
          {children}
        </div>
      )}
    </div>
  );
}
