import React, { useState, forwardRef } from 'react';
import { color, radius, font, transition, shadow } from '../../constants/design';

/**
 * Spanavi 共通セレクト (ネイティブ <select> ベース)
 *
 * @prop size, label, hint, error, required, fullWidth
 * @prop options: [{ value, label }] or children を直接渡してもOK
 */
const SIZE = {
  sm: { padY: 6,  padX: 10, fontSize: font.size.sm,   minH: 28 },
  md: { padY: 9,  padX: 12, fontSize: font.size.md,   minH: 36 },
  lg: { padY: 12, padX: 14, fontSize: font.size.lg,   minH: 44 },
};

const Select = forwardRef(function Select({
  size = 'md',
  label,
  hint,
  error,
  required,
  options,
  fullWidth = true,
  style,
  containerStyle,
  children,
  ...rest
}, ref) {
  const [focused, setFocused] = useState(false);
  const s = SIZE[size] || SIZE.md;

  const borderClr = error
    ? color.danger
    : focused
      ? color.navyLight
      : color.border;

  return (
    <div style={{ width: fullWidth ? '100%' : undefined, ...containerStyle }}>
      {label && (
        <div style={{
          fontSize: font.size.sm,
          fontWeight: font.weight.semibold,
          color: color.textMid,
          letterSpacing: font.letterSpacing.wide,
          marginBottom: 4,
        }}>
          {label}
          {required && <span style={{ color: color.danger, marginLeft: 2 }}>*</span>}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <select
          ref={ref}
          style={{
            width: '100%',
            padding: `${s.padY}px ${s.padX + 22}px ${s.padY}px ${s.padX}px`,
            fontSize: s.fontSize,
            color: color.textDark,
            fontFamily: font.family.sans,
            background: color.white,
            border: `1px solid ${borderClr}`,
            borderRadius: radius.md,
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            cursor: 'pointer',
            minHeight: s.minH,
            boxShadow: focused
              ? (error ? shadow.ringDanger : shadow.ring)
              : 'none',
            transition: `border-color ${transition.base}, box-shadow ${transition.base}`,
            boxSizing: 'border-box',
            ...style,
          }}
          onFocus={e => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={e => { setFocused(false); rest.onBlur?.(e); }}
          {...rest}
        >
          {options
            ? options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))
            : children}
        </select>
        {/* 三角インジケータ */}
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          style={{ position: 'absolute', right: s.padX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: color.textMid }}
        >
          <path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {error && <div style={{ fontSize: font.size.xs, color: color.danger, marginTop: 4 }}>{error}</div>}
      {!error && hint && <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 4 }}>{hint}</div>}
    </div>
  );
});

export default Select;
