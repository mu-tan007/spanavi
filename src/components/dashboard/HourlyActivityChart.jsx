import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);

const toJSTHour = (utcStr) => parseInt(new Date(utcStr).toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }), 10);
const toJSTDate = (utcStr) => new Date(utcStr).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const call = payload.find(p => p.dataKey === 'callOnly')?.value || 0;
  const connect = payload.find(p => p.dataKey === 'connectOnly')?.value || 0;
  const appo = payload.find(p => p.dataKey === 'appo')?.value || 0;
  return (
    <div style={{ background: NAVY, borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 11 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div>架電合計: {call + connect + appo}件</div>
      <div style={{ color: '#93C5FD' }}>うち接続: {connect + appo}件</div>
      <div style={{ color: GOLD }}>うちアポ: {appo}件</div>
    </div>
  );
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatJP(dateStr) {
  const [y, m, day] = dateStr.split('-');
  return `${y}/${m}/${day}`;
}

export default function HourlyActivityChart({ records, selectedDate, setSelectedDate, loading }) {
  const nowHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }), 10);
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });

  const chartData = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => {
      const h = i + 9;
      const recs = records.filter(r => toJSTDate(r.called_at) === selectedDate && toJSTHour(r.called_at) === h);
      const appo = recs.filter(r => r.status === 'アポ獲得').length;
      const connect = recs.filter(r => CEO_CONNECT.has(r.status)).length;
      return {
        label: h + '時', hour: h,
        callOnly: recs.length - connect,
        connectOnly: connect - appo,
        appo,
      };
    });
  }, [records, selectedDate]);

  const bestAppoSlot = chartData.reduce((best, d) => d.appo > (best?.appo ?? -1) ? d : best, chartData[0]);

  const navBtnStyle = {
    padding: '5px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Noto Sans JP'", border: '1px solid ' + C.border,
    background: '#fff', color: NAVY,
  };
  const dateInputStyle = {
    padding: '4px 8px', borderRadius: 5, border: '1px solid ' + C.border,
    fontSize: 12, color: NAVY, outline: 'none', fontFamily: "'Noto Sans JP'",
    fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>時間帯別活動グラフ</span>
          {loading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
          {bestAppoSlot && bestAppoSlot.appo > 0 && (
            <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>
              最もアポが取れた時間帯：{bestAppoSlot.label}（{bestAppoSlot.appo}件）
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button style={navBtnStyle} onClick={() => setSelectedDate(addDays(selectedDate, -1))}>◀ 前日</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type='date'
              value={selectedDate}
              max={todayStr}
              onChange={e => setSelectedDate(e.target.value)}
              style={dateInputStyle}
            />
          </div>
          <button
            style={{ ...navBtnStyle, opacity: selectedDate >= todayStr ? 0.4 : 1, cursor: selectedDate >= todayStr ? 'not-allowed' : 'pointer' }}
            onClick={() => { if (selectedDate < todayStr) setSelectedDate(addDays(selectedDate, 1)); }}
            disabled={selectedDate >= todayStr}
          >翌日 ▶</button>
        </div>
      </div>

      {/* 凡例 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11, color: C.textMid }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#3B82F6', marginRight: 4 }} />架電（接続なし）</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#F59E0B', marginRight: 4 }} />社長接続</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#10B981', marginRight: 4 }} />アポ取得</span>
      </div>

      <ResponsiveContainer width='100%' height={220}>
        <BarChart data={chartData} barSize={26} barCategoryGap='20%'>
          <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' vertical={false} />
          <XAxis dataKey='label' tick={({ x, y, payload }) => {
            const item = chartData.find(d => d.label === payload.value);
            const isCurrent = selectedDate === todayStr && item?.hour === nowHour;
            return (
              <text x={x} y={y + 12} textAnchor='middle' fontSize={9}
                fill={isCurrent ? GOLD : '#374151'}
                fontWeight={isCurrent ? 700 : 400}>{payload.value}</text>
            );
          }} />
          <YAxis tick={{ fontSize: 9 }} width={26} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey='callOnly' stackId='a' name='架電'>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill='#3B82F6'
                stroke={selectedDate === todayStr && entry.hour === nowHour ? GOLD : 'none'}
                strokeWidth={selectedDate === todayStr && entry.hour === nowHour ? 2 : 0} />
            ))}
          </Bar>
          <Bar dataKey='connectOnly' stackId='a' fill='#F59E0B' name='社長接続' />
          <Bar dataKey='appo' stackId='a' fill='#10B981' name='アポ取得' radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
