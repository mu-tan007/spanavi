import { useState, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';
import { fetchCallActivity, fetchAppoActivity } from '../../lib/supabaseWrite';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import ActivitySummaryCards from '../dashboard/ActivitySummaryCards';
import HourlyActivityChart from '../dashboard/HourlyActivityChart';
import ActivityRankingSection from '../dashboard/ActivityRankingSection';
import TeamPerformanceTable from '../dashboard/TeamPerformanceTable';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);

function getActivityDateRange(period, customFrom, customTo, todayStr, weekStartStr, monthStr) {
  if (period === 'day')  return { from: todayStr, to: todayStr };
  if (period === 'week') return { from: weekStartStr, to: todayStr };
  if (period === 'month') return { from: monthStr + '-01', to: todayStr };
  if (period === 'custom' && customFrom) return { from: customFrom, to: customTo || todayStr };
  return null;
}

function getPrevActivityDateRange(period, todayStr, weekStartStr, monthStr) {
  if (period === 'day') {
    const d = new Date(todayStr); d.setDate(d.getDate() - 1);
    const s = d.toISOString().slice(0, 10); return { from: s, to: s };
  }
  if (period === 'week') {
    const ws = new Date(weekStartStr); ws.setDate(ws.getDate() - 7);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    return { from: ws.toISOString().slice(0, 10), to: we.toISOString().slice(0, 10) };
  }
  if (period === 'month') {
    const [y, m] = monthStr.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    const ym = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
    const last = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
    return { from: ym + '-01', to: ym + '-' + String(last).padStart(2, '0') };
  }
  return null;
}

const _offsetDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function PerformanceView({ members, currentUser }) {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const todayD = new Date(todayStr);
  const dayOfWeek = todayD.getDay();
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - ((dayOfWeek + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);

  const _jstStart = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
  const _jstEnd   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();

  // セクション1: 活動サマリー
  const [activityPeriod, setActivityPeriod] = useState('week');
  const [activityFrom, setActivityFrom] = useState('');
  const [activityTo, setActivityTo] = useState('');
  const [activityRecords, setActivityRecords] = useState([]);
  const [activityPrevRecords, setActivityPrevRecords] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    const range = getActivityDateRange(activityPeriod, activityFrom, activityTo, todayStr, weekStartStr, monthStr);
    if (!range) return;
    const prevRange = getPrevActivityDateRange(activityPeriod, todayStr, weekStartStr, monthStr);
    let cancelled = false;
    setActivityLoading(true);
    const p1 = fetchCallActivity(_jstStart(range.from), _jstEnd(range.to));
    const p2 = prevRange ? fetchCallActivity(_jstStart(prevRange.from), _jstEnd(prevRange.to)) : Promise.resolve({ data: [] });
    Promise.all([p1, p2])
      .then(([cur, prev]) => { if (!cancelled) { setActivityRecords(cur.data || []); setActivityPrevRecords(prev.data || []); } })
      .catch(err => console.error('[PerformanceView] activityFetch:', err))
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, [activityPeriod, activityFrom, activityTo, todayStr, weekStartStr, monthStr]);

  // セクション2: 時間帯別
  const [hourlyDate, setHourlyDate] = useState(todayStr);
  const [hourlyRecords, setHourlyRecords] = useState([]);
  const [hourlyLoading, setHourlyLoading] = useState(false);

  useEffect(() => {
    if (!hourlyDate) return;
    let cancelled = false;
    setHourlyLoading(true);
    fetchCallActivity(_jstStart(hourlyDate), _jstEnd(hourlyDate))
      .then(({ data }) => { if (!cancelled) setHourlyRecords(data || []); })
      .catch(err => console.error('[PerformanceView] hourlyFetch:', err))
      .finally(() => { if (!cancelled) setHourlyLoading(false); });
    return () => { cancelled = true; };
  }, [hourlyDate]);

  // セクション3+5: ランキング・チーム
  const [rankPeriod, setRankPeriod] = useState('week');
  const [rankFrom, setRankFrom] = useState('');
  const [rankTo, setRankTo] = useState('');
  const [rankRecords, setRankRecords] = useState([]);
  const [appoRankRecords, setAppoRankRecords] = useState([]);
  const [rankLoading, setRankLoading] = useState(false);

  useEffect(() => {
    const range = getActivityDateRange(rankPeriod, rankFrom, rankTo, todayStr, weekStartStr, monthStr);
    if (!range) return;
    let cancelled = false;
    setRankLoading(true);
    Promise.all([
      fetchCallActivity(_jstStart(range.from), _jstEnd(range.to)),
      fetchAppoActivity(_jstStart(range.from), _jstEnd(range.to)),
    ])
      .then(([calls, appos]) => {
        if (!cancelled) {
          setRankRecords(calls.data || []);
          setAppoRankRecords(appos.data || []);
        }
      })
      .catch(err => console.error('[PerformanceView] rankFetch:', err))
      .finally(() => { if (!cancelled) setRankLoading(false); });
    return () => { cancelled = true; };
  }, [rankPeriod, rankFrom, rankTo, todayStr, weekStartStr, monthStr]);

  // セクション4: 成長トレンド（過去8週間）
  const [trendRecords, setTrendRecords] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);
    const from8w = _offsetDays(weekStartStr, -7 * 7);
    fetchCallActivity(_jstStart(from8w), _jstEnd(todayStr))
      .then(({ data }) => { if (!cancelled) setTrendRecords(data || []); })
      .catch(err => console.error('[PerformanceView] trendFetch:', err))
      .finally(() => { if (!cancelled) setTrendLoading(false); });
    return () => { cancelled = true; };
  }, [weekStartStr, todayStr]);

  const teamMap = useMemo(() => {
    const m = {};
    (members || [])
      .filter(mb => mb.is_active !== false && mb.name && !/^user_/i.test(mb.name))
      .forEach(mb => { m[mb.name] = mb.team ? mb.team + 'チーム' : '営業統括'; });
    return m;
  }, [members]);

  const trendData = useMemo(() => {
    const result = [];
    for (let w = 7; w >= 0; w--) {
      const ws = _offsetDays(weekStartStr, -w * 7);
      const we = w === 0 ? todayStr : _offsetDays(ws, 6);
      const recs = trendRecords.filter(r => {
        const d = new Date(r.called_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
        return d >= ws && d <= we;
      });
      result.push({
        label: ws.slice(5).replace('-', '/'),
        calls: recs.length,
        connect: recs.filter(r => CEO_CONNECT.has(r.status)).length,
        appo: recs.filter(r => r.status === 'アポ獲得').length,
      });
    }
    return result;
  }, [trendRecords, weekStartStr, todayStr]);

  const alerts = useMemo(() => {
    const result = [];
    const weekCallers = new Set(rankRecords.map(r => r.getter_name).filter(Boolean));
    const allMembers = (members || [])
      .filter(m => typeof m === 'object' ? m.is_active !== false && m.name && !/^user_/i.test(m.name) : true)
      .map(m => typeof m === 'object' ? m.name : m)
      .filter(Boolean);
    const zeroCallers = allMembers.filter(n => !weekCallers.has(n) && teamMap[n] !== '営業統括' && teamMap[n] !== 'その他');
    if (zeroCallers.length > 0) {
      result.push({ type: 'warn', message: `架電ゼロのメンバー（期間中）: ${zeroCallers.slice(0, 4).join('、')}${zeroCallers.length > 4 ? ` 他${zeroCallers.length - 4}名` : ''}` });
    }
    const byPerson = {};
    rankRecords.forEach(r => {
      const k = r.getter_name || '不明';
      if (!byPerson[k]) byPerson[k] = { call: 0, appo: 0 };
      byPerson[k].call++;
      if (r.status === 'アポ獲得') byPerson[k].appo++;
    });
    const lowAppo = Object.entries(byPerson).filter(([, d]) => d.call >= 15 && d.appo === 0);
    if (lowAppo.length > 0) {
      result.push({ type: 'info', message: `アポ0件（15架電以上）: ${lowAppo.map(([n]) => n).slice(0, 4).join('、')}${lowAppo.length > 4 ? ` 他${lowAppo.length - 4}名` : ''}` });
    }
    return result;
  }, [rankRecords, members, teamMap]);

  const tabBtn = (active, color) => ({
    padding: '6px 12px', fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer',
    background: 'transparent', border: 'none', borderBottom: '2px solid ' + (active ? (color || '#C8A84B') : 'transparent'),
    color: active ? '#032D60' : '#9CA3AF', borderRadius: 0, fontFamily: "'Noto Sans JP'",
    transition: 'all 0.15s',
  });
  const dateInputStyle = { padding: '3px 6px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, color: C.textDark, outline: 'none', fontFamily: "'Noto Sans JP'" };

  const simplePeriodSelector = (period, setPeriod, from, setFrom, to, setTo, accent) => (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #E5E5E5' }}>
      {[['day', '日'], ['week', '週'], ['month', '月'], ['custom', '期間指定']].map(([k, l]) => (
        <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k, accent)}>{l}</button>
      ))}
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type='date' value={from} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
          <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
          <input type='date' value={to} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
        </div>
      )}
    </div>
  );

  const TrendTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: NAVY, borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}週</div>
        <div>架電: {payload.find(p => p.dataKey === 'calls')?.value || 0}件</div>
        <div style={{ color: '#93C5FD' }}>接続: {payload.find(p => p.dataKey === 'connect')?.value || 0}件</div>
        <div style={{ color: GOLD }}>アポ: {payload.find(p => p.dataKey === 'appo')?.value || 0}件</div>
      </div>
    );
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>

      {/* セクション1: 活動サマリー */}
      <ActivitySummaryCards
        records={activityRecords}
        prevRecords={activityPrevRecords}
        period={activityPeriod}
        setPeriod={setActivityPeriod}
        customFrom={activityFrom}
        setCustomFrom={setActivityFrom}
        customTo={activityTo}
        setCustomTo={setActivityTo}
        loading={activityLoading}
      />

      {/* セクション2: 時間帯別 */}
      <HourlyActivityChart
        records={hourlyRecords}
        selectedDate={hourlyDate}
        setSelectedDate={setHourlyDate}
        loading={hourlyLoading}
      />

      {/* セクション4: 成長トレンド */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', marginBottom: 16, boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>成長トレンド（週次推移）</span>
          {trendLoading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
        </div>
        <ResponsiveContainer width='100%' height={200}>
          <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
            <XAxis dataKey='label' tick={{ fontSize: 9, fill: '#888' }} />
            <YAxis tick={{ fontSize: 9, fill: '#888' }} width={28} />
            <Tooltip content={<TrendTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type='monotone' dataKey='calls' stroke={NAVY} strokeWidth={2} dot={{ r: 3 }} name='架電数' />
            <Line type='monotone' dataKey='connect' stroke='#3B82F6' strokeWidth={2} dot={{ r: 3 }} name='社長接続' />
            <Line type='monotone' dataKey='appo' stroke={GOLD} strokeWidth={2} dot={{ r: 3 }} name='アポ' />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* アラート検知 */}
      {alerts.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 20px', marginBottom: 16, boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>アラート検知</span>
          </div>
          {alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 6, marginBottom: 6, background: a.type === 'warn' ? '#FEF3C7' : '#EFF6FF', borderLeft: `3px solid ${a.type === 'warn' ? '#F59E0B' : '#3B82F6'}` }}>
              <span style={{ fontSize: 11, color: a.type === 'warn' ? '#92400E' : '#1D4ED8', flexShrink: 0 }}>{a.type === 'warn' ? '!' : 'i'}</span>
              <span style={{ fontSize: 11, color: a.type === 'warn' ? '#92400E' : '#1D4ED8' }}>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* セクション3+5: ランキング・チーム分析 */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', marginBottom: 20, boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>活動ランキング・チーム分析</span>
            {rankLoading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
          </div>
          {simplePeriodSelector(rankPeriod, setRankPeriod, rankFrom, setRankFrom, rankTo, setRankTo, NAVY)}
        </div>
        <ActivityRankingSection
          records={rankRecords}
          appoRecords={appoRankRecords}
          loading={rankLoading}
          currentUser={currentUser}
        />
        <TeamPerformanceTable
          records={rankRecords}
          appoRecords={appoRankRecords}
          loading={rankLoading}
          teamMap={teamMap}
        />
      </div>

    </div>
  );
}
