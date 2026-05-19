import React from 'react';
import { color, space, radius, font, shadow } from '../../../../constants/design';

// スパキャリ運営ダッシュボード共通 KPI カード
// すべての KPI 表示はこれを使う（Sessions / Homework / Courses / Analytics）
//
// @prop label      見出し（例 "進行中の顧客"）
// @prop value      数値（number / string）
// @prop unit       単位（例 "名" / "%"）任意
// @prop hint       補足テキスト 任意
// @prop tone       'navy' | 'primary' | 'success' | 'warn' | 'danger' | 'info'
// @prop accentTop  true で上 3px のアクセントボーダー
// @prop loading    true で値を — 表示
const TONE_COLOR = {
  navy:    'navy',
  primary: 'navyLight',
  success: 'success',
  warn:    'warn',
  danger:  'danger',
  info:    'info',
};

export default function KpiCard({
  label,
  value,
  unit,
  hint,
  tone = 'navy',
  accentTop = false,
  loading = false,
}) {
  const accent = color[TONE_COLOR[tone] || 'navy'] || color.navy;
  const display = loading
    ? '—'
    : value === null || value === undefined
      ? '—'
      : typeof value === 'number'
        ? value.toLocaleString()
        : String(value);

  return (
    <div style={{
      background: color.white,
      border: `1px solid ${color.border}`,
      borderTop: accentTop ? `3px solid ${accent}` : `1px solid ${color.border}`,
      borderRadius: radius.lg,
      boxShadow: shadow.sm,
      padding: space[4],
      display: 'flex',
      flexDirection: 'column',
      gap: space[1],
      minWidth: 0,
    }}>
      <div style={{
        fontSize: font.size.xs,
        color: color.textMid,
        fontWeight: font.weight.semibold,
        letterSpacing: font.letterSpacing.wide,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontSize: font.size['2xl'],
          fontWeight: font.weight.bold,
          color: accent,
          fontFamily: font.family.mono,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: font.lineHeight.tight,
        }}>
          {display}
        </span>
        {unit && (
          <span style={{
            fontSize: font.size.sm,
            color: color.textMid,
            fontWeight: font.weight.medium,
          }}>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div style={{
          fontSize: font.size.xs,
          color: color.textLight,
          lineHeight: font.lineHeight.normal,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}
