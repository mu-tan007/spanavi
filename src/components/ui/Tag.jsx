import React from 'react';
import Badge from './Badge';

/**
 * Tag は Badge の薄バージョン（ステータスというより属性ラベル向け）。
 * 内部的には Badge を再利用、デフォルト variant が 'neutral'。
 *
 * @prop closable: boolean (× ボタン表示)
 * @prop onClose: () => void
 */
export default function Tag({
  variant = 'neutral',
  size = 'sm',
  closable = false,
  onClose,
  children,
  ...rest
}) {
  return (
    <Badge variant={variant} size={size} {...rest}>
      {children}
      {closable && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose?.(); }}
          style={{
            marginLeft: 4,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            color: 'currentColor',
            opacity: 0.6,
            lineHeight: 1,
            fontSize: 'inherit',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </Badge>
  );
}
