import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { color, font } from '../../../../constants/design';

// 構成比の円グラフ（AIコスト機能別内訳など）
// data: [{ label: '議事録生成', value: 1234 }, ...]
export default function PieBreakdownChart({ data, height = 240, colors }) {
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

  // ブランドカラーをベースにしたカテゴリカラー
  const palette = colors || [
    color.navy,       // #032D60
    color.navyLight,  // #0176D3
    color.gold,
    color.success,
    color.warn,
    color.info,
    color.danger,
    color.gray500,
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cx="40%"
          cy="50%"
          outerRadius={Math.min(height * 0.35, 80)}
          innerRadius={Math.min(height * 0.18, 40)}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: color.white,
            border: `1px solid ${color.border}`,
            borderRadius: 4,
            fontSize: 11,
          }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconSize={10}
          wrapperStyle={{ fontSize: 11, color: color.textMid }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
