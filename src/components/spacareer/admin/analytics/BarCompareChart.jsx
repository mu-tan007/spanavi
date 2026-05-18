import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell,
} from 'recharts';
import { color, font } from '../../../../constants/design';

// 比較用の棒グラフ（トレーナー比較や動画ランキング等）
// data: [{ label: 'トレーナーA', 値: 12 }, ...]
// barKey: '値'  / barLabel: '担当顧客数' / barColor: hex
export default function BarCompareChart({ data, barKey, barLabel, barColor, height = 240, horizontal = false }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height,
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

  const baseColor = barColor || color.navy;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 16, bottom: 0, left: horizontal ? 80 : -8 }}
      >
        <CartesianGrid stroke={color.borderLight} strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11, fill: color.textMid }} axisLine={{ stroke: color.border }} tickLine={{ stroke: color.border }} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: color.textMid }} axisLine={{ stroke: color.border }} tickLine={{ stroke: color.border }} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: color.textMid }} axisLine={{ stroke: color.border }} tickLine={{ stroke: color.border }} />
            <YAxis tick={{ fontSize: 11, fill: color.textMid }} axisLine={{ stroke: color.border }} tickLine={{ stroke: color.border }} width={36} />
          </>
        )}
        <Tooltip
          contentStyle={{
            background: color.white,
            border: `1px solid ${color.border}`,
            borderRadius: 4,
            fontSize: 11,
          }}
          labelStyle={{ color: color.textDark, fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: color.textMid }} />
        <Bar dataKey={barKey} name={barLabel} fill={baseColor} radius={[3, 3, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={baseColor} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
