import React from 'react';
import { color, space, radius, font, alpha } from '../../../../constants/design';

// シンプルなヒートマップ（Slack日次連絡実施率の曜日×週マトリクス等）
// data: 2次元配列 [[v, v, v, ...], ...]（rows = 行、cols = 列）
// rowLabels: ['週1', '週2', ...]
// colLabels: ['月', '火', '水', '木', '金', '土', '日']
// max: 値の上限（色濃さ用、未指定なら data の max）
export default function HeatmapChart({ data, rowLabels, colLabels, max, unit = '' }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color.textLight,
        fontSize: font.size.sm,
      }}>
        データなし
      </div>
    );
  }

  const _max = (max ?? data.flat().reduce((m, v) => Math.max(m, Number(v) || 0), 0)) || 1;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        borderCollapse: 'separate',
        borderSpacing: 2,
        fontSize: font.size.xs,
        fontFamily: font.family.mono,
      }}>
        <thead>
          <tr>
            <th style={{ background: 'transparent' }} />
            {colLabels.map((cl, i) => (
              <th key={i} style={{
                padding: '4px 8px',
                color: color.textMid,
                fontWeight: font.weight.semibold,
                textAlign: 'center',
                fontFamily: font.family.sans,
              }}>
                {cl}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri}>
              <td style={{
                padding: '4px 8px',
                color: color.textMid,
                fontFamily: font.family.sans,
                textAlign: 'right',
                fontSize: font.size.xs,
              }}>
                {rowLabels[ri] || ''}
              </td>
              {row.map((v, ci) => {
                const ratio = Math.max(0, Math.min(1, (Number(v) || 0) / _max));
                const bg = alpha(color.navy, 0.08 + ratio * 0.65);
                return (
                  <td key={ci} style={{
                    background: bg,
                    color: ratio > 0.5 ? color.white : color.textDark,
                    padding: '6px 10px',
                    minWidth: 36,
                    textAlign: 'center',
                    borderRadius: radius.sm,
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: font.weight.semibold,
                  }}>
                    {Number.isFinite(Number(v)) ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }) + unit : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
