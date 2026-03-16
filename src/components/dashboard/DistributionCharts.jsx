import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const PALETTE = ['#0D2247', '#1e4080', '#2d5a9e', '#4472c4', '#6693d6', '#8fb4e8', '#C8A84B', '#e0c97a', '#10B981', '#F59E0B'];

const toJSTHour = (utcStr) => parseInt(new Date(utcStr).toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }), 10);

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: NAVY, borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 11 }}>
      <div style={{ fontWeight: 700 }}>{payload[0].name}</div>
      <div>{payload[0].value}件 ({(payload[0].percent * 100).toFixed(1)}%)</div>
    </div>
  );
}

function renderLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 1.35;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} fill={NAVY} fontSize={9} fontWeight={600}>
      {name}
    </text>
  );
}

function PieSection({ title, data, emptyMsg }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 12 }}>{emptyMsg}</div>
      ) : (
        <ResponsiveContainer width='100%' height={220}>
          <PieChart>
            <Pie data={data} cx='50%' cy='50%' outerRadius={75} dataKey='value' label={renderLabel} labelLine={false}>
              {data.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function DistributionCharts({ hourlyRecords, rankRecords, loading }) {
  const hourlyAppoData = useMemo(() => {
    const m = {};
    hourlyRecords.forEach(r => {
      if (r.status !== 'アポ獲得') return;
      const h = toJSTHour(r.called_at);
      m[h] = (m[h] || 0) + 1;
    });
    return Object.entries(m)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([h, v]) => ({ name: h + '時台', value: v }));
  }, [hourlyRecords]);

  const memberCallData = useMemo(() => {
    const m = {};
    rankRecords.forEach(r => {
      const k = r.getter_name || '不明';
      m[k] = (m[k] || 0) + 1;
    });
    const sorted = Object.entries(m).sort((a, b) => b[1] - a[1]);
    if (sorted.length <= 5) return sorted.map(([name, value]) => ({ name, value }));
    const top5 = sorted.slice(0, 5).map(([name, value]) => ({ name, value }));
    const others = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    if (others > 0) top5.push({ name: 'その他', value: others });
    return top5;
  }, [rankRecords]);

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', marginBottom: 20, boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 16 }}>🥧</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>分布グラフ</span>
        {loading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
      </div>
      <div style={{ display: 'flex', gap: 32 }}>
        <PieSection
          title='⏰ 時間帯別アポ取得分布'
          data={hourlyAppoData}
          emptyMsg='アポ取得データなし'
        />
        <PieSection
          title='📞 メンバー別架電数分布（上位5名）'
          data={memberCallData}
          emptyMsg='データなし'
        />
      </div>
    </div>
  );
}
