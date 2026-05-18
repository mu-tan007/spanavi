import React from 'react';
import { color, space, radius, font } from '../../../../constants/design';

// スパキャリ分析レポート用 KPIカード
// - label: 見出し（例「進行中顧客数」）
// - value: 数値
// - unit:  単位（例「名」「%」）
// - sub:   補足テキスト（前期比など）
// - tone:  'navy' | 'success' | 'warn' | 'danger' | 'info'
export default function KpiCard({ label, value, unit, sub, tone = 'navy', loading = false }) {
  const accent = {
    navy:    color.navy,
    success: color.success,
    warn:    color.warn,
    danger:  color.danger,
    info:    color.info,
  }[tone] || color.navy;

  const display = loading
    ? '—'
    : (value === null || value === undefined)
      ? '—'
      : typeof value === 'number'
        ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
        : String(value);

  return (
    <div style={{
      background: color.white,
      border: `1px solid ${color.border}`,
      borderRadius: radius.md,
      padding: `${space[3] + 2}px ${space[4]}px`,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{
        fontSize: 10,
        color: color.textLight,
        fontWeight: font.weight.bold,
        letterSpacing: font.letterSpacing.wide,
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{
          fontSize: 22,
          fontWeight: 900,
          color: accent,
          fontFamily: font.family.mono,
          letterSpacing: '-0.5px',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}>
          {display}
        </div>
        {unit && (
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid }}>
            {unit}
          </div>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: color.textLight, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
