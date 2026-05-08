import React from 'react';
import { color, radius, font, alpha } from '../../constants/design';

/**
 * Spanavi 共通バッジ (ステータス・タグ表示)
 *
 * @prop variant: 'default' | 'primary' | 'success' | 'warn' | 'danger' | 'info' | 'neutral'
 * @prop size: 'sm' | 'md'
 * @prop solid: boolean (true=塗りつぶし、false=枠+薄背景 default)
 * @prop dot: boolean (左に小さい色付き丸を表示)
 */
const VARIANT = {
  default: { fg: color.textDark,  bg: color.gray100,                  border: color.border },
  primary: { fg: color.navy,      bg: alpha(color.navyLight, 0.10),   border: alpha(color.navyLight, 0.25) },
  success: { fg: '#1F6537',       bg: color.successSoft,              border: alpha(color.success, 0.25) },
  warn:    { fg: '#A0651F',       bg: color.warnSoft,                 border: alpha(color.warn, 0.30) },
  danger:  { fg: '#A20018',       bg: color.dangerSoft,               border: alpha(color.danger, 0.25) },
  info:    { fg: color.navyLight, bg: color.infoSoft,                 border: alpha(color.navyLight, 0.25) },
  neutral: { fg: color.textMid,   bg: color.gray50,                   border: color.borderLight },
};

const SIZE = {
  sm: { padY: 1, padX: 6,  fontSize: font.size.xs - 1, dot: 5 },
  md: { padY: 2, padX: 8,  fontSize: font.size.xs,     dot: 6 },
};

export default function Badge({
  variant = 'default',
  size = 'md',
  solid = false,
  dot = false,
  style,
  children,
  ...rest
}) {
  const v = VARIANT[variant] || VARIANT.default;
  const s = SIZE[size] || SIZE.md;

  const dotColor =
    variant === 'success' ? color.success :
    variant === 'warn'    ? color.warn :
    variant === 'danger'  ? color.danger :
    variant === 'info' || variant === 'primary' ? color.navyLight :
    variant === 'neutral' ? color.textLight :
    color.textMid;

  const solidStyle = {
    background:
      variant === 'success' ? color.success :
      variant === 'warn'    ? color.warn :
      variant === 'danger'  ? color.danger :
      variant === 'info' || variant === 'primary' ? color.navyLight :
      color.navy,
    color: color.white,
    border: '1px solid transparent',
  };
  const subtleStyle = { background: v.bg, color: v.fg, border: `1px solid ${v.border}` };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dot ? 5 : 0,
        padding: `${s.padY}px ${s.padX}px`,
        fontSize: s.fontSize,
        fontWeight: font.weight.semibold,
        fontFamily: font.family.sans,
        letterSpacing: font.letterSpacing.wide,
        borderRadius: radius.sm,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        ...(solid ? solidStyle : subtleStyle),
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span style={{
          width: s.dot, height: s.dot, borderRadius: '50%',
          background: solid ? color.white : dotColor, flexShrink: 0,
        }}/>
      )}
      {children}
    </span>
  );
}
