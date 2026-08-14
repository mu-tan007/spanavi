import React, { useState, useMemo, useEffect } from 'react';
import { color, radius, font, shadow, alpha } from '../../constants/design';
import { useIsMobile } from '../../hooks/useIsMobile';

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
 * @prop columns: [{ key, label, width, align, render, cellStyle, headerStyle, sortable, sortType, sortValue }]
 *   - sortable: true でその列をヘッダークリックでソート可能に
 *   - sortType: 'string' なら初回クリックで昇順、それ以外(数値)は初回降順
 *   - sortValue: (row) => 比較に使う値（省略時は row[key]）
 * @prop defaultSort: { key, dir: 'asc'|'desc' } | null  初期ソート状態
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
 *
 * 行展開（任意）:
 * @prop expandable: (row, index) => boolean | null  - true なら展開トグルを表示
 * @prop renderExpanded: (row, index) => ReactNode    - 展開時に表示する内容
 * @prop expandedKeys: Set<string|number>             - 展開中の rowKey 集合（外部 state）
 * @prop onToggleExpand: (key) => void                - トグル時のコールバック
 *
 * モバイル（幅768px未満）:
 *   横スクロールする表はスマホで判読できないため、1行=1カードの積み上げ表示に自動で切り替わる。
 *   列側で見え方を指定できる:
 *     - mobilePrimary: true  … カードの見出しにする列（未指定なら最初の列）
 *     - mobileHidden: true   … スマホでは省く列
 *     - mobileLabel: string  … スマホのカード内で使うラベル（未指定なら label）
 *   mobileCards={false} を渡すと従来どおり横スクロールの表のままにできる。
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
  defaultSort = null,
  onSortChange,
  // 行展開
  expandable,
  renderExpanded,
  expandedKeys,
  onToggleExpand,
  // モバイル
  mobileCards = true,
}) {
  const [hoverKey, setHoverKey] = useState(null);
  const [sortState, setSortState] = useState(defaultSort);
  const isMobile = useIsMobile();

  // ソート状態の変化を親に通知（永続化等に利用）
  useEffect(() => {
    if (onSortChange) onSortChange(sortState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortState]);

  const handleSort = (col) => {
    if (!col || !col.sortable) return;
    setSortState((prev) => {
      if (!prev || prev.key !== col.key) {
        return { key: col.key, dir: col.sortType === 'string' ? 'asc' : 'desc' };
      }
      return { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sortState || !sortState.key) return rows;
    const col = columns.find((c) => c.key === sortState.key);
    if (!col) return rows;
    const accessor = typeof col.sortValue === 'function' ? col.sortValue : (r) => r[col.key];
    const dir = sortState.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      const aNil = va === null || va === undefined || va === '';
      const bNil = vb === null || vb === undefined || vb === '';
      if (aNil && bNil) return 0;
      if (aNil) return 1;   // 空は常に末尾
      if (bNil) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'ja') * dir;
    });
  }, [rows, sortState, columns]);
  // 展開トグル列を表示するか（expandable プロップ指定時のみ）。
  // renderExpanded だけ指定された場合はトグル列なしで body のみ描画
  // （企業名タップ等、外部から toggle するパターンに対応）。
  const hasExpandToggle = typeof expandable === 'function' && typeof renderExpanded === 'function';
  const hasExpandBody = typeof renderExpanded === 'function' && expandedKeys instanceof Set;

  // 展開トグル列（32px固定）を columns に prepend する
  const effectiveColumns = hasExpandToggle
    ? [
        {
          key: '__expand__',
          label: '',
          width: 32,
          align: 'center',
          headerStyle: { padding: 0 },
          cellStyle: { padding: 0 },
          render: (row, idx) => {
            if (!expandable(row, idx)) return '';
            const key = typeof rowKey === 'function' ? rowKey(row, idx)
              : typeof rowKey === 'string' && row && row[rowKey] != null ? row[rowKey]
              : idx;
            const isOpen = expandedKeys && expandedKeys.has(key);
            return (
              <span
                role="button"
                aria-label={isOpen ? '行を閉じる' : '行を展開'}
                aria-expanded={isOpen}
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onToggleExpand && onToggleExpand(key); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleExpand && onToggleExpand(key);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  width: 20, height: 20,
                  alignItems: 'center', justifyContent: 'center',
                  color: color.textMid,
                  cursor: 'pointer',
                  fontSize: font.size.xs,
                  transition: 'transform 0.15s ease',
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  userSelect: 'none',
                }}
              >▶</span>
            );
          },
        },
        ...columns,
      ]
    : columns;

  // fillWidth=true: 列合計が画面幅未満なら、各列を比例して広げる (画面幅いっぱい使う)
  // fillWidth=false (default): 固定 px 幅 (合計が画面より小さくても左寄せ、超えれば横スクロール)
  const totalNumWidth = effectiveColumns.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0);
  const gridTemplateColumns = effectiveColumns
    .map(c => {
      if (typeof c.width === 'number') {
        return fillWidth
          ? `minmax(${c.width}px, ${c.width}fr)`
          : `${c.width}px`;
      }
      return c.width || 'minmax(80px, 1fr)';
    })
    .join(' ');
  const minWidth = effectiveColumns.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 80), 0);

  const getKey = (row, idx) => {
    if (typeof rowKey === 'function') return rowKey(row, idx);
    if (typeof rowKey === 'string' && row && row[rowKey] != null) return row[rowKey];
    return idx;
  };

  // height='auto' の場合は flex/scroll を解除して自然伸縮 (グループ並列表示などに使用)
  const isAuto = height === 'auto' || height === undefined;

  // ===== モバイル: 1行 = 1カード =====
  // 列を横に並べたままだと、スマホ幅では1列あたり20px程度しか取れず
  // ヘッダーが重なったり社名が縦1文字ずつになる。行を縦に開いて見せる。
  if (isMobile && mobileCards) {
    const visibleCols = columns.filter(c => !c.mobileHidden);
    const primaryCol = visibleCols.find(c => c.mobilePrimary) || visibleCols[0];
    const detailCols = visibleCols.filter(c => c !== primaryCol);

    return (
      <div
        className={className}
        style={{
          display: isAuto ? 'block' : 'flex',
          flexDirection: 'column',
          height: isAuto ? undefined : height,
          minHeight: 0,
          background: 'transparent',
          ...style,
        }}
      >
        <div
          className="spa-scroll-y"
          style={{
            flex: isAuto ? undefined : 1,
            minHeight: 0,
            overflowY: isAuto ? 'visible' : 'auto',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {loading ? (
            <MobileSkeletonCards />
          ) : error ? (
            <div style={cardShell}><ErrorState error={error} /></div>
          ) : rows.length === 0 ? (
            <div style={cardShell}><EmptyState message={emptyMessage} /></div>
          ) : (
            sortedRows.map((row, idx) => {
              const key = getKey(row, idx);
              const accent = rowAccent ? rowAccent(row, idx) : null;
              const accentColor = ACCENT_COLORS[accent] || accent;
              const isExpanded = hasExpandBody && expandedKeys.has(key);
              const canExpand = hasExpandToggle && expandable(row, idx);
              const headRaw = primaryCol
                ? (primaryCol.render ? primaryCol.render(row, idx) : row[primaryCol.key])
                : null;

              return (
                <div
                  key={key}
                  role="row"
                  className={onRowClick ? 'spa-press-flat' : undefined}
                  onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                  style={{
                    ...cardShell,
                    borderLeft: accentColor ? `3px solid ${accentColor}` : cardShell.border,
                    background: (rowBackground && rowBackground(row, idx)) || color.white,
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}
                >
                  {/* 見出し行 */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    marginBottom: detailCols.length ? 8 : 0,
                  }}>
                    <div style={{
                      flex: 1, minWidth: 0,
                      fontSize: font.size.base, fontWeight: font.weight.semibold,
                      color: color.navy, lineHeight: 1.45,
                    }}>
                      {headRaw === null || headRaw === undefined || headRaw === '' ? '—' : headRaw}
                    </div>
                    {canExpand && (
                      <button
                        type="button"
                        className="no-min-height"
                        aria-label={isExpanded ? '閉じる' : '詳細を開く'}
                        aria-expanded={isExpanded}
                        onClick={(e) => { e.stopPropagation(); onToggleExpand && onToggleExpand(key); }}
                        style={{
                          flexShrink: 0, width: 32, height: 32, border: 'none',
                          background: alpha(color.navy, 0.06), color: color.navy,
                          borderRadius: radius.md, cursor: 'pointer', fontSize: font.size.xs,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >{isExpanded ? '▲' : '▼'}</button>
                    )}
                  </div>

                  {/* 明細（ラベル: 値 の2列） */}
                  {detailCols.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 6 }}>
                      {detailCols.map(col => {
                        const raw = col.render ? col.render(row, idx) : row[col.key];
                        const empty = raw === null || raw === undefined || raw === '';
                        return (
                          <React.Fragment key={col.key}>
                            <span style={{
                              fontSize: font.size.xs, color: color.textLight,
                              whiteSpace: 'nowrap', paddingTop: 1,
                            }}>{col.mobileLabel || col.label}</span>
                            <span style={{
                              fontSize: font.size.sm, color: color.textDark,
                              minWidth: 0, textAlign: 'left', lineHeight: 1.5,
                              ...(col.cellStyle || {}),
                              // 表用に付いている省略指定はカードでは邪魔なので解除する
                              whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip',
                            }}>{empty ? '—' : raw}</span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}

                  {isExpanded && (
                    <div style={{
                      marginTop: 10, paddingTop: 10,
                      borderTop: `1px solid ${color.borderLight}`,
                    }}>
                      {renderExpanded(row, idx)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {showCount && !loading && !error && (
          <div style={{
            padding: '8px 4px 0', fontSize: font.size.xs, color: color.textMid,
            fontFamily: font.family.mono, textAlign: 'right', flexShrink: 0,
          }}>
            {rows.length.toLocaleString()} 件
          </div>
        )}
      </div>
    );
  }

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
            {effectiveColumns.map((col) => {
              const active = sortState && sortState.key === col.key;
              const indicator = col.sortable
                ? (active ? (sortState.dir === 'asc' ? '▲' : '▼') : '⇅')
                : null;
              return (
                <span
                  key={col.key}
                  role="columnheader"
                  aria-sort={active ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : (col.sortable ? 'none' : undefined)}
                  onClick={col.sortable ? () => handleSort(col) : undefined}
                  style={{
                    textAlign: col.align || 'left',
                    userSelect: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: col.sortable ? 'pointer' : 'default',
                    ...(col.headerStyle || {}),
                  }}
                >
                  {col.label}
                  {indicator && (
                    <span style={{ marginLeft: 4, fontSize: 9, opacity: active ? 1 : 0.45, verticalAlign: 'middle' }}>
                      {indicator}
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {/* Body */}
          {loading ? (
            <SkeletonRows columns={effectiveColumns} gridTemplateColumns={gridTemplateColumns} />
          ) : error ? (
            <ErrorState error={error} />
          ) : rows.length === 0 ? (
            <EmptyState message={emptyMessage} />
          ) : (
            sortedRows.map((row, idx) => {
              const key = getKey(row, idx);
              const isHover = hoverKey === key;
              const accent = rowAccent ? rowAccent(row, idx) : null;
              const customBg = rowBackground ? rowBackground(row, idx) : null;
              const baseBg = customBg || (zebra && idx % 2 === 1 ? color.cream : color.white);
              const accentColor = ACCENT_COLORS[accent] || accent;
              const isExpanded = hasExpandBody && expandedKeys.has(key);

              return (
                <React.Fragment key={key}>
                <div
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
                    borderBottom: isExpanded ? `1px solid ${color.border}` : `1px solid ${color.borderLight}`,
                    borderLeft: accentColor ? `3px solid ${accentColor}` : '3px solid transparent',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 0.15s ease',
                    alignItems: 'center',
                  }}
                >
                  {effectiveColumns.map((col) => {
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
                {isExpanded && (
                  <div
                    role="row"
                    aria-expanded="true"
                    style={{
                      padding: '12px 16px 18px 16px',
                      background: color.offWhite,
                      borderBottom: `1px solid ${color.borderLight}`,
                      borderLeft: accentColor ? `3px solid ${accentColor}` : '3px solid transparent',
                    }}
                  >
                    {renderExpanded(row, idx)}
                  </div>
                )}
                </React.Fragment>
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

// モバイルのカード1枚分の外枠
const cardShell = {
  background: color.white,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  boxShadow: shadow.sm,
  padding: '12px 14px',
};

function MobileSkeletonCards() {
  return (
    <>
      <style>{`
        @keyframes spaSkelPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.85; } }
      `}</style>
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} style={cardShell}>
          <div style={{
            height: 12, width: '62%', background: color.gray200, borderRadius: radius.sm,
            marginBottom: 10, animation: 'spaSkelPulse 1.4s ease-in-out infinite',
            animationDelay: `${(idx * 0.06) % 0.4}s`,
          }} />
          <div style={{
            height: 9, width: '86%', background: color.gray200, borderRadius: radius.sm,
            marginBottom: 6, animation: 'spaSkelPulse 1.4s ease-in-out infinite',
            animationDelay: `${(idx * 0.06 + 0.1) % 0.4}s`,
          }} />
          <div style={{
            height: 9, width: '48%', background: color.gray200, borderRadius: radius.sm,
            animation: 'spaSkelPulse 1.4s ease-in-out infinite',
            animationDelay: `${(idx * 0.06 + 0.2) % 0.4}s`,
          }} />
        </div>
      ))}
    </>
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
