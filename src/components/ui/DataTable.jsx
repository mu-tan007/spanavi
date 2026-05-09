import React, { useState } from 'react';
import { color, radius, font, shadow, alpha } from '../../constants/design';

/**
 * Spanavi 共通テーブル (Phase 1: スリム版)
 *
 * 全表で必須の7機能のみ:
 * 1. スクロール構造 (固定高さ + 内部スクロール + ヘッダー sticky)
 * 2. 行ホバー
 * 3. 空状態 / ローディング (skeleton) / エラー
 * 4. 文字溢れ ellipsis + tooltip
 * 5. ARIA roles (grid / row / cell)
 * 6. 件数表示
 * 7. モバイル横スクロール対応
 *
 * @prop columns: [{ key, label, width, align, render, cellStyle, headerStyle }]
 * @prop rows: any[]
 * @prop rowKey: string | (row, index) => string|number
 * @prop loading: boolean
 * @prop error: string | { message } | null
 * @prop emptyMessage: string
 * @prop onRowClick: (row, index) => void
 * @prop height: string | number (default 'calc(100vh - 200px)')
 * @prop showCount: boolean (default true)
 * @prop rowAccent: (row) => 'danger' | 'warn' | 'success' | 'primary' | string | null
 * @prop rowBackground: (row) => string | null
 * @prop zebra: boolean (default true)
 */
const DEFAULT_HEIGHT = 'calc(100vh - 200px)';

const ACCENT_COLORS = {
  danger: color.danger,
  warn: color.warn,
  success: color.success,
  primary: color.navy,
  info: color.info,
};

export default function DataTable({
  columns,
  rows = [],
  rowKey,
  loading = false,
  error = null,
  emptyMessage = 'データがありません',
  onRowClick,
  height = DEFAULT_HEIGHT,
  showCount = true,
  rowAccent,
  rowBackground,
  zebra = true,
  fillWidth = false,
  className,
  style,
  ariaLabel,
}) {
  const [hoverKey, setHoverKey] = useState(null);

  // fillWidth=true: 列合計が画面幅未満なら、各列を比例して広げる (画面幅いっぱい使う)
  // fillWidth=false (default): 固定 px 幅 (合計が画面より小さくても左寄せ、超えれば横スクロール)
  const totalNumWidth = columns.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0);
  const gridTemplateColumns = columns
    .map(c => {
      if (typeof c.width === 'number') {
        return fillWidth
          ? `minmax(${c.width}px, ${c.width}fr)`
          : `${c.width}px`;
      }
      return c.width || 'minmax(80px, 1fr)';
    })
    .join(' ');
  const minWidth = columns.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 80), 0);

  const getKey = (row, idx) => {
    if (typeof rowKey === 'function') return rowKey(row, idx);
    if (typeof rowKey === 'string' && row && row[rowKey] != null) return row[rowKey];
    return idx;
  };

  // height='auto' の場合は flex/scroll を解除して自然伸縮 (グループ並列表示などに使用)
  const isAuto = height === 'auto' || height === undefined;

  return (
    <div
      className={className}
      style={{
        display: isAuto ? 'block' : 'flex',
        flexDirection: 'column',
        height: isAuto ? undefined : height,
        minHeight: 0,
        overflow: isAuto ? 'visible' : 'hidden',
        background: color.white,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        boxShadow: shadow.sm,
        ...style,
      }}
    >
      <div
        role="grid"
        aria-label={ariaLabel}
        aria-rowcount={rows.length}
        style={{
          flex: isAuto ? undefined : 1,
          minHeight: 0,
          overflowY: isAuto ? 'visible' : 'auto',
          overflowX: 'auto',
        }}
      >
        <div style={{ minWidth, position: 'relative' }}>
          {/* ヘッダー (sticky) */}
          <div
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns,
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: color.navy,
              color: color.white,
              fontSize: font.size.xs,
              fontWeight: font.weight.semibold,
              letterSpacing: font.letterSpacing.wide,
              padding: '10px 16px',
            }}
          >
            {columns.map((col) => (
              <span
                key={col.key}
                role="columnheader"
                style={{
                  textAlign: col.align || 'left',
                  userSelect: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  ...(col.headerStyle || {}),
                }}
              >
                {col.label}
              </span>
            ))}
          </div>

          {/* Body */}
          {loading ? (
            <SkeletonRows columns={columns} gridTemplateColumns={gridTemplateColumns} />
          ) : error ? (
            <ErrorState error={error} />
          ) : rows.length === 0 ? (
            <EmptyState message={emptyMessage} />
          ) : (
            rows.map((row, idx) => {
              const key = getKey(row, idx);
              const isHover = hoverKey === key;
              const accent = rowAccent ? rowAccent(row, idx) : null;
              const customBg = rowBackground ? rowBackground(row, idx) : null;
              const baseBg = customBg || (zebra && idx % 2 === 1 ? color.cream : color.white);
              const accentColor = ACCENT_COLORS[accent] || accent;

              return (
                <div
                  key={key}
                  role="row"
                  aria-rowindex={idx + 2}
                  onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                  onMouseEnter={() => setHoverKey(key)}
                  onMouseLeave={() => setHoverKey(null)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns,
                    padding: '8px 16px',
                    fontSize: font.size.sm,
                    color: color.textDark,
                    background: isHover ? alpha(color.navyLight, 0.06) : baseBg,
                    borderBottom: `1px solid ${color.borderLight}`,
                    borderLeft: accentColor ? `3px solid ${accentColor}` : '3px solid transparent',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 0.15s ease',
                    alignItems: 'center',
                  }}
                >
                  {columns.map((col) => {
                    const raw = col.render ? col.render(row, idx) : row[col.key];
                    const isText = typeof raw === 'string' || typeof raw === 'number';
                    return (
                      <span
                        key={col.key}
                        role="gridcell"
                        title={isText ? String(raw) : undefined}
                        style={{
                          textAlign: col.align || 'left',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          ...(col.cellStyle || {}),
                        }}
                      >
                        {raw === null || raw === undefined || raw === '' ? '—' : raw}
                      </span>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer (件数) */}
      {showCount && !loading && !error && (
        <div
          style={{
            padding: '6px 16px',
            background: color.cream,
            borderTop: `1px solid ${color.borderLight}`,
            fontSize: font.size.xs,
            color: color.textMid,
            fontFamily: font.family.mono,
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {rows.length.toLocaleString()} 件
        </div>
      )}
    </div>
  );
}

function SkeletonRows({ columns, gridTemplateColumns }) {
  return (
    <div>
      <style>{`
        @keyframes spaSkelPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.85; }
        }
      `}</style>
      {Array.from({ length: 8 }).map((_, idx) => (
        <div
          key={idx}
          style={{
            display: 'grid',
            gridTemplateColumns,
            padding: '14px 16px',
            borderBottom: `1px solid ${color.borderLight}`,
          }}
        >
          {columns.map((col, i) => (
            <span key={i} style={{ paddingRight: 12 }}>
              <span
                style={{
                  display: 'block',
                  background: color.gray200,
                  borderRadius: radius.sm,
                  height: 10,
                  width: `${40 + ((i + idx) * 13) % 45}%`,
                  animation: 'spaSkelPulse 1.4s ease-in-out infinite',
                  animationDelay: `${(idx * 0.05) % 0.4}s`,
                }}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div
      role="status"
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        color: color.textLight,
        fontSize: font.size.sm,
      }}
    >
      <svg width="44" height="44" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 12, opacity: 0.45 }}>
        <rect x="8" y="12" width="32" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="8" y1="20" x2="40" y2="20" stroke="currentColor" strokeWidth="1.5" />
        <line x1="20" y1="20" x2="20" y2="36" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div>{message}</div>
    </div>
  );
}

function ErrorState({ error }) {
  const msg = typeof error === 'string' ? error : (error?.message || 'エラーが発生しました');
  return (
    <div
      role="alert"
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        fontSize: font.size.sm,
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: font.weight.semibold, color: color.danger }}>
        読み込みエラー
      </div>
      <div style={{ color: color.textMid }}>{msg}</div>
    </div>
  );
}
