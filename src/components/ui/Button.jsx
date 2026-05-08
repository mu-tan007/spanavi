import React from 'react';
import { color, radius, font, shadow, transition, alpha } from '../../constants/design';

/**
 * Spanavi 共通ボタン
 *
 * @prop variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
 * @prop size: 'sm' | 'md' | 'lg'
 * @prop fullWidth: boolean
 * @prop loading: boolean
 * @prop iconLeft / iconRight: ReactNode
 */
const SIZE = {
  sm: { padY: 5,  padX: 12, fontSize: font.size.sm,   minH: 28 },
  md: { padY: 8,  padX: 16, fontSize: font.size.md,   minH: 36 },
  lg: { padY: 11, padX: 20, fontSize: font.size.md,   minH: 44 },
};

const VARIANT = {
  primary: {
    bg: color.navy, color: color.white, border: 'transparent',
    hoverBg: color.navyDark, activeBg: color.navyDeep,
  },
  secondary: {
    bg: color.cream, color: color.textDark, border: color.border,
    hoverBg: color.snow, activeBg: color.gray100,
  },
  ghost: {
    bg: 'transparent', color: color.navy, border: 'transparent',
    hoverBg: alpha(color.navy, 0.06), activeBg: alpha(color.navy, 0.10),
  },
  danger: {
    bg: color.danger, color: color.white, border: 'transparent',
    hoverBg: '#C00020', activeBg: '#A00018',
  },
  outline: {
    bg: 'transparent', color: color.navy, border: color.navy,
    hoverBg: alpha(color.navy, 0.06), activeBg: alpha(color.navy, 0.12),
  },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  iconLeft,
  iconRight,
  type = 'button',
  style,
  children,
  onClick,
  ...rest
}) {
  const v = VARIANT[variant] || VARIANT.primary;
  const s = SIZE[size] || SIZE.md;
  const isDisabled = disabled || loading;

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: fullWidth ? '100%' : undefined,
    minHeight: s.minH,
    padding: `${s.padY}px ${s.padX}px`,
    fontSize: s.fontSize,
    fontWeight: font.weight.semibold,
    fontFamily: font.family.sans,
    letterSpacing: font.letterSpacing.wide,
    color: v.color,
    background: v.bg,
    border: `1px solid ${v.border === 'transparent' ? 'transparent' : v.border}`,
    borderRadius: radius.md,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.55 : 1,
    transition: `background ${transition.base}, border-color ${transition.base}, box-shadow ${transition.base}, transform ${transition.fast}`,
    outline: 'none',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...style,
  };

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      style={base}
      onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = v.hoverBg; }}
      onMouseLeave={e => { if (!isDisabled) e.currentTarget.style.background = v.bg; }}
      onMouseDown={e => { if (!isDisabled) e.currentTarget.style.background = v.activeBg; }}
      onMouseUp={e => { if (!isDisabled) e.currentTarget.style.background = v.hoverBg; }}
      onFocus={e => { e.currentTarget.style.boxShadow = shadow.ring; }}
      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
      {...rest}
    >
      {loading ? <Spinner size={s.fontSize} /> : iconLeft}
      {children}
      {iconRight}
    </button>
  );
}

function Spinner({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spaSpin 0.8s linear infinite' }}>
      <style>{`@keyframes spaSpin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M22 12 a10 10 0 0 1 -10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
