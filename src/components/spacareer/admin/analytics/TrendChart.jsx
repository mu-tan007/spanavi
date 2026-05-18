import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { color, font } from '../../../../constants/design';

// 時系列推移用の折れ線グラフ
// data: [{ label: '5/1', 値1: 12, 値2: 5 }, ...]
// series: [{ key: '値1', label: '進行中', color: '#0D2247' }, ...]
export default function TrendChart({ data, series, height = 220 }) {
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={color.borderLight} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: color.textMid }}
          axisLine={{ stroke: color.border }}
          tickLine={{ stroke: color.border }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: color.textMid }}
          axisLine={{ stroke: color.border }}
          tickLine={{ stroke: color.border }}
          width={36}
        />
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
        {series.map(s => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
