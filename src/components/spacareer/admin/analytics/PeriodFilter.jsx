import React from 'react';
import { color, space, radius, font, alpha } from '../../../../constants/design';

// 分析レポート用 期間選択フィルタ
// - 固定: 直近7日 / 直近30日 / 直近90日
// - カスタム: from 〜 to を date input で指定
export default function PeriodFilter({
  preset, setPreset,   // 'last7' | 'last30' | 'last90' | 'custom'
  from, setFrom,
  to, setTo,
}) {
  const presets = [
    { key: 'last7',  label: '直近7日' },
    { key: 'last30', label: '直近30日' },
    { key: 'last90', label: '直近90日' },
    { key: 'custom', label: 'カスタム' },
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: space[3],
      flexWrap: 'wrap',
      padding: `${space[3]}px ${space[4]}px`,
      background: color.white,
      border: `1px solid ${color.border}`,
      borderRadius: radius.md,
      marginBottom: space[4],
    }}>
      <div style={{
        fontSize: font.size.xs,
        color: color.textLight,
        fontWeight: font.weight.bold,
        letterSpacing: font.letterSpacing.wide,
        textTransform: 'uppercase',
      }}>
        期間
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {presets.map(p => {
          const active = preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              style={{
                padding: '6px 12px',
                fontSize: font.size.sm,
                fontWeight: font.weight.semibold,
                color: active ? color.white : color.textDark,
                background: active ? color.navy : color.white,
                border: `1px solid ${active ? color.navy : color.border}`,
                borderRadius: radius.md,
                cursor: 'pointer',
                fontFamily: font.family.sans,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <input
            type="date"
            value={from || ''}
            onChange={(e) => setFrom(e.target.value)}
            style={{
              padding: '6px 8px',
              fontSize: font.size.sm,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              fontFamily: font.family.sans,
              color: color.textDark,
              background: color.white,
            }}
          />
          <span style={{ fontSize: font.size.sm, color: color.textMid }}>〜</span>
          <input
            type="date"
            value={to || ''}
            onChange={(e) => setTo(e.target.value)}
            style={{
              padding: '6px 8px',
              fontSize: font.size.sm,
              border: `1px solid ${color.border}`,
              borderRadius: radius.md,
              fontFamily: font.family.sans,
              color: color.textDark,
              background: color.white,
            }}
          />
        </div>
      )}
    </div>
  );
}
