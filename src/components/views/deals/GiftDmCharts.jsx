import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { color, space, radius, font } from '../../../constants/design';
import { Card } from '../../ui';

// 「dorayaki AI」タブの上に置くグラフ3枚。GiftDmTab と同じ行（gift_shipment_stats）から作る。
// どれも横棒1系列。棒の意味は縦軸の文字で読めるので、色だけに頼らない。

const BAR = 14;
const ROW_H = 30;

function pct(v, n) {
  return n ? `${Math.round((v / n) * 1000) / 10}%` : '—';
}

function ChartTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: color.navy, color: color.white, borderRadius: radius.md,
      padding: `${space[1]}px ${space[2]}px`, fontSize: font.size.xs,
    }}>
      <div style={{ fontWeight: font.weight.semibold }}>{d.label}</div>
      <div>{`${d.value}社（送付の${pct(d.value, total)}）`}</div>
    </div>
  );
}

function HBarCard({ title, data, total }) {
  const height = data.length * ROW_H + 16;
  return (
    <Card padding="sm" style={{ flex: '1 1 320px', minWidth: 0 }}>
      <div style={{
        fontSize: font.size.sm, fontWeight: font.weight.semibold,
        color: color.navy, marginBottom: space[2],
      }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={color.gray200} />
          <XAxis type="number" hide domain={[0, Math.max(total, 1)]} />
          <YAxis
            type="category" dataKey="label" width={112} axisLine={false} tickLine={false}
            tick={{ fontSize: 11, fill: color.textMid }}
          />
          <Tooltip cursor={{ fill: color.gray100 }} content={<ChartTooltip total={total} />} />
          <Bar dataKey="value" barSize={BAR} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.label} fill={d.fill || color.navy} />)}
            <LabelList
              dataKey="value" position="right"
              formatter={(v) => `${v}（${pct(v, total)}）`}
              style={{ fontSize: 11, fill: color.textMid }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default function GiftDmCharts({ rows }) {
  const n = rows.length;

  const funnel = useMemo(() => [
    { label: '送付', value: n },
    { label: '到着', value: rows.filter(r => r.delivered_on && !r.return_status).length },
    { label: '二次元コードの読み取り', value: rows.filter(r => r.first_scan_at).length },
    { label: '導線のクリック', value: rows.filter(r => r.clicked_calendar || r.clicked_deck || r.clicked_website).length },
    { label: '日程調整の予約', value: rows.filter(r => r.booked_at).length },
  ], [rows, n]);

  const delivery = useMemo(() => {
    const returned = rows.filter(r => r.return_status);
    const arrived = rows.filter(r => r.delivered_on && !r.return_status).length;
    return [
      { label: '到着', value: arrived },
      { label: '配送中・確認中', value: n - arrived - returned.length, fill: color.gray400 },
      { label: '受取拒否', value: returned.filter(r => r.return_status === '受取拒否').length, fill: color.warn },
      { label: '返送', value: returned.filter(r => r.return_status === '返送').length, fill: color.warn },
    ];
  }, [rows, n]);

  // 架電結果は多い順。まだ架けていない会社は最後に灰色で置く
  const calls = useMemo(() => {
    const counts = new Map();
    rows.forEach((r) => {
      if (r.call_status) counts.set(r.call_status, (counts.get(r.call_status) || 0) + 1);
    });
    const list = [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    list.push({ label: '未架電', value: rows.filter(r => !r.call_status).length, fill: color.gray400 });
    return list;
  }, [rows]);

  if (!n) return null;

  return (
    <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
      <HBarCard title="反応の段階" data={funnel} total={n} />
      <HBarCard title="配送状況" data={delivery} total={n} />
      <HBarCard title="フォロー架電の結果" data={calls} total={n} />
    </div>
  );
}
