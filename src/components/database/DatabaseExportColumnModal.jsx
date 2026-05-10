import { useState, useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button } from '../ui';
import { X } from 'lucide-react';

export default function DatabaseExportColumnModal({ columns, totalCount, onCancel, onConfirm }) {
  const [selected, setSelected] = useState(() => new Set(columns.map(c => c.key)));

  const toggle = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columns.map(c => c.key)));
  const clearAll = () => setSelected(new Set());

  const selectedKeys = useMemo(
    () => columns.filter(c => selected.has(c.key)).map(c => c.key),
    [columns, selected]
  );
  const selectedCount = selectedKeys.length;
  const canConfirm = selectedCount > 0;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: alpha(color.navyDeep, 0.5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: color.white,
          borderRadius: radius.xl,
          width: Math.min(560, window.innerWidth - 40),
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: shadow.xl,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: `${space[4]}px ${space[5]}px`,
          borderBottom: `1px solid ${color.border}`,
        }}>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy }}>
            エクスポートするカラムを選択
            <span style={{ fontSize: font.size.sm, color: color.textLight, marginLeft: space[2], fontWeight: font.weight.normal }}>
              {totalCount.toLocaleString()}件
            </span>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}
            aria-label="閉じる"
          >
            <X size={20} color={color.textMid} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: space[5] }}>
          {/* Toolbar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: space[3],
            paddingBottom: space[2.5],
            borderBottom: `1px solid ${color.borderLight}`,
          }}>
            <div style={{ fontSize: font.size.sm, color: color.textMid }}>
              <span style={{ fontWeight: font.weight.semibold, color: color.navy }}>{selectedCount}</span>
              {' / '}{columns.length} 列を選択中
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              <Button variant="ghost" size="sm" onClick={selectAll}>全選択</Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>全解除</Button>
            </div>
          </div>

          {/* Checkbox list (2 columns) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: `${space[2]}px ${space[4]}px`,
          }}>
            {columns.map(col => {
              const checked = selected.has(col.key);
              return (
                <label
                  key={col.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: space[2],
                    padding: `${space[1.5]}px ${space[2]}px`,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    background: checked ? alpha(color.navyLight, 0.06) : 'transparent',
                    border: `1px solid ${checked ? alpha(color.navy, 0.2) : color.borderLight}`,
                    transition: 'background 0.15s, border-color 0.15s',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(col.key)}
                    style={{ cursor: 'pointer', accentColor: color.navy }}
                  />
                  <span style={{
                    fontSize: font.size.sm,
                    color: checked ? color.navy : color.textMid,
                    fontWeight: checked ? font.weight.semibold : font.weight.normal,
                  }}>
                    {col.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: space[2],
          padding: `${space[3]}px ${space[5]}px`,
          borderTop: `1px solid ${color.border}`,
          background: color.snow,
          borderBottomLeftRadius: radius.xl,
          borderBottomRightRadius: radius.xl,
        }}>
          <Button variant="outline" onClick={onCancel}>キャンセル</Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(selectedKeys)}
            disabled={!canConfirm}
          >
            決定（{selectedCount}列をエクスポート）
          </Button>
        </div>
      </div>
    </div>
  );
}
