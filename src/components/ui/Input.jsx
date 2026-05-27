import React, { useState, forwardRef } from 'react';
import { color, radius, font, transition, shadow } from '../../constants/design';

/**
 * Spanavi 共通入力欄
 *
 * @prop size: 'sm' | 'md' | 'lg'
 * @prop label: string (上部ラベル)
 * @prop hint: string (下部ヒント)
 * @prop error: string (エラー時にラベル下に赤表示)
 * @prop required: boolean
 * @prop iconLeft / iconRight: ReactNode (中身のアイコン)
 * @prop fullWidth: boolean (default true)
 */
const SIZE = {
  sm: { padY: 6,  padX: 10, fontSize: font.size.sm,   minH: 28 },
  md: { padY: 9,  padX: 12, fontSize: font.size.md,   minH: 36 },
  lg: { padY: 12, padX: 14, fontSize: font.size.lg,   minH: 44 },
};

const Input = forwardRef(function Input({
  size = 'md',
  label,
  hint,
  error,
  required,
  iconLeft,
  iconRight,
  fullWidth = true,
  style,
  containerStyle,
  ...rest
}, ref) {
  const [focused, setFocused] = useState(false);
  // IME 日本語入力中フラグ。compositionstart〜end の間、外部 onChange を握りつぶす。
  // これがないと useUrlState 等が中間文字を反映して input が再描画され、変換が壊れる
  // (例:「黒田」と打つと「kくくrくろくろdくろだ」になる事故)。
  const [composing, setComposing] = useState(false);
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
      <div style={{
        display: 'flex', alignItems: 'center',
        background: color.white,
        border: `1px solid ${borderClr}`,
        borderRadius: radius.md,
        boxShadow: focused
          ? (error ? shadow.ringDanger : shadow.ring)
          : 'none',
        transition: `border-color ${transition.base}, box-shadow ${transition.base}`,
        boxSizing: 'border-box',
      }}>
        {iconLeft && <span style={{ paddingLeft: s.padX, color: color.textMid, display: 'inline-flex' }}>{iconLeft}</span>}
        <input
          ref={ref}
          style={{
            flex: 1,
            padding: `${s.padY}px ${s.padX}px`,
            fontSize: s.fontSize,
            color: color.textDark,
            fontFamily: font.family.sans,
            outline: 'none',
            border: 'none',
            background: 'transparent',
            minHeight: s.minH - 2,
            boxSizing: 'border-box',
            width: '100%',
            ...style,
          }}
          {...rest}
          onFocus={e => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={e => { setFocused(false); rest.onBlur?.(e); }}
          onChange={e => { if (!composing) rest.onChange?.(e); }}
          onCompositionStart={e => { setComposing(true); rest.onCompositionStart?.(e); }}
          onCompositionEnd={e => { setComposing(false); rest.onChange?.(e); rest.onCompositionEnd?.(e); }}
        />
        {iconRight && <span style={{ paddingRight: s.padX, color: color.textMid, display: 'inline-flex' }}>{iconRight}</span>}
      </div>
      {error && (
        <div style={{ fontSize: font.size.xs, color: color.danger, marginTop: 4 }}>{error}</div>
      )}
      {!error && hint && (
        <div style={{ fontSize: font.size.xs, color: color.textLight, marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
});

export default Input;
