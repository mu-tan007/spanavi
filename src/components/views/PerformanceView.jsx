import { useState, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';
import { fetchCallActivity, fetchAppoActivity, fetchCallSessionsForRange } from '../../lib/supabaseWrite';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import ActivitySummaryCards from '../dashboard/ActivitySummaryCards';
import HourlyActivityChart from '../dashboard/HourlyActivityChart';
import ActivityRankingSection from '../dashboard/ActivityRankingSection';
import TeamPerformanceTable from '../dashboard/TeamPerformanceTable';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const CEO_CONNECT = new Set(['アポ獲得', '社長お断り', '社長再コール']);

const jstHourOf = (iso) => (new Date(iso).getUTCHours() + 9) % 24;
const jstDateOf = (iso) => new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);

// call_records の called_at から稼働時間を計算する
// 人ごと・日ごとに min(called_at) 〜 max(called_at) の差分を合算
function calcWorkHours(calls) {
  const dayBounds = {}; // { jstDate: { min: ms, max: ms } }
  calls.forEach(r => {
    const ms   = new Date(r.called_at).getTime();
    const date = jstDateOf(r.called_at);
    if (!dayBounds[date]) dayBounds[date] = { min: ms, max: ms };
    else {
      if (ms < dayBounds[date].min) dayBounds[date].min = ms;
      if (ms > dayBounds[date].max) dayBounds[date].max = ms;
    }
  });
  return Object.values(dayBounds).reduce((sum, d) => sum + Math.max((d.max - d.min) / 3600000, 0), 0);
}

function PersonDetailModal({ person, callRecords, appoRecords, sessions, members, teamMap, rankDateRange, onClose }) {
  const personCalls = callRecords.filter(r => r.getter_name === person);
  const personAppos = appoRecords.filter(r => r.getter_name === person);
  const personSessions = sessions
    .filter(s => s.caller_name === person)
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

  const member = (members || []).find(m => typeof m === 'object' && m.name === person) || {};

  const totalCalls   = personCalls.length;
  const totalConnect = personCalls.filter(r => CEO_CONNECT.has(r.status)).length;
  const totalAppo    = personAppos.length;

  const sessionHours = calcWorkHours(personCalls);
  const cph = sessionHours > 0.01 ? (totalCalls / sessionHours).toFixed(1) : null;

  const hourlyChartData = useMemo(() => {
    const buckets = {};
    personCalls.forEach(r => {
      const h = (new Date(r.called_at).getUTCHours() + 9) % 24;
      if (!buckets[h]) buckets[h] = { hour: h, normal: 0, ceo: 0, appo: 0 };
      if (r.status === 'アポ獲得') buckets[h].appo++;
      else if (CEO_CONNECT.has(r.status)) buckets[h].ceo++;
      else buckets[h].normal++;
    });
    return Array.from({ length: 24 }, (_, h) => buckets[h] || { hour: h, normal: 0, ceo: 0, appo: 0 })
      .filter(d => d.hour >= 8 && d.hour < 20 && d.normal + d.ceo + d.appo > 0);
  }, [personCalls]);

  const sessionRows = personSessions
    .filter(s => { const h = jstHourOf(s.started_at); return h >= 8 && h < 20; })
    .map(s => {
      const start  = new Date(s.started_at);
      const endRaw = s.finished_at || s.last_called_at;
      const end    = endRaw ? new Date(endRaw) : null;
      const sessionCalls = end
        ? personCalls.filter(r => { const t = new Date(r.called_at); return t >= start && t <= end; }).length
        : 0;
      return {
        id: s.id,
        startStr: start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }),
        endStr: end ? end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : '進行中',
        isLive: !end,
        sessionCalls,
      };
    });

  const dateLabel = rankDateRange
    ? (rankDateRange.from === rankDateRange.to ? rankDateRange.from : `${rankDateRange.from} 〜 ${rankDateRange.to}`)
    : '';
  const meta = [teamMap[person], member.role, member.rank].filter(Boolean).join(' · ');

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: NAVY, borderRadius: '4px 4px 0 0', padding: '12px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1E40AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {person.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{person}</div>
            {meta && <div style={{ fontSize: 11, color: '#93C5FD', marginTop: 2 }}>{meta}</div>}
          </div>
          {dateLabel && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: '#93C5FD' }}>集計期間</div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{dateLabel}</div>
            </div>
          )}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 13, marginLeft: 8 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: '架電件数',   value: totalCalls,   sub: null },
              { label: '件/h',       value: cph ?? '-',   sub: cph ? `${sessionHours.toFixed(1)}h稼働` : null },
              { label: '社長接続',   value: totalConnect, sub: totalCalls > 0 ? `${(totalConnect / totalCalls * 100).toFixed(1)}%` : null },
              { label: 'アポ取得',   value: totalAppo,    sub: totalCalls > 0 ? `${(totalAppo / totalCalls * 100).toFixed(1)}%` : null },
            ].map(({ label, value, sub }) => (
              <div key={label} style={{ background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'", fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                {sub && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{sub}</div>}
              </div>
            ))}
          </div>

          {/* Hourly chart */}
          {hourlyChartData.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid #0D2247', paddingBottom: 6, marginBottom: 12 }}>時間帯別架電</div>
              <ResponsiveContainer width='100%' height={170}>
                <BarChart data={hourlyChartData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
                  <XAxis dataKey='hour' tick={{ fontSize: 9 }} tickFormatter={h => `${h}時`} />
                  <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(v, name) => [v, { normal: '架電（接続なし）', ceo: '社長接続', appo: 'アポ取得' }[name] || name]}
                    contentStyle={{ background: '#0D2247', borderRadius: 4, color: '#fff', padding: '8px 12px', fontSize: 11, border: 'none' }}
                    labelStyle={{ color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey='normal' stackId='a' fill={NAVY} name='normal' />
                  <Bar dataKey='ceo'    stackId='a' fill='#1E40AF' name='ceo' />
                  <Bar dataKey='appo'   stackId='a' fill='#6B7280' name='appo' />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 10, color: '#6B7280', marginTop: 6 }}>
                {[['#0D2247','架電（接続なし）'],['#1E40AF','社長接続'],['#6B7280','アポ取得']].map(([bg, label]) => (
                  <span key={label}><span style={{ display: 'inline-block', width: 10, height: 10, background: bg, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />{label}</span>
                ))}
              </div>
            </div>
          )}

          {/* Session table */}
          {sessionRows.length > 0 ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid #0D2247', paddingBottom: 6, marginBottom: 12 }}>セッション一覧</div>
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr', background: '#0D2247', color: '#fff', fontSize: 13, fontWeight: 600, padding: '8px 16px', verticalAlign: 'middle' }}>
                  <span>開始</span><span>終了</span><span>架電数</span>
                </div>
                {sessionRows.map((row, i) => (
                  <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr', padding: '8px 16px', fontSize: 11, borderBottom: i < sessionRows.length - 1 ? '1px solid #E5E7EB' : 'none', background: i % 2 === 0 ? '#fff' : '#F8F9FA' }}>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{row.startStr}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, fontVariantNumeric: 'tabular-nums', color: row.isLive ? '#10B981' : '#374151' }}>{row.endStr}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{row.sessionCalls}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, fontSize: 12, color: '#9CA3AF' }}>セッションデータなし</div>
          )}
        </div>
      </div>
    </div>
  );
}

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

export default function PerformanceView({ members, currentUser, appoData = [] }) {
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
  const [sessionRecords, setSessionRecords] = useState([]);
  const [rankLoading, setRankLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);

  const rankDateRange = useMemo(
    () => getActivityDateRange(rankPeriod, rankFrom, rankTo, todayStr, weekStartStr, monthStr),
    [rankPeriod, rankFrom, rankTo, todayStr, weekStartStr, monthStr]
  );

  useEffect(() => {
    const range = rankDateRange;
    if (!range) return;
    let cancelled = false;
    setRankLoading(true);
    Promise.all([
      fetchCallActivity(_jstStart(range.from), _jstEnd(range.to)),
      fetchAppoActivity(_jstStart(range.from), _jstEnd(range.to)),
      fetchCallSessionsForRange(_jstStart(range.from), _jstEnd(range.to)),
    ])
      .then(([calls, appos, sessions]) => {
        if (!cancelled) {
          setRankRecords(calls.data || []);
          setAppoRankRecords(appos.data || []);
          setSessionRecords(sessions.data || []);
        }
      })
      .catch(err => console.error('[PerformanceView] rankFetch:', err))
      .finally(() => { if (!cancelled) setRankLoading(false); });
    return () => { cancelled = true; };
  }, [rankDateRange]);

  // 人ごとの合計稼働時間 { name: totalHours }
  // call_records の min(called_at)〜max(called_at) を日ごとに集計
  const sessionMap = useMemo(() => {
    const byName = {};
    rankRecords.forEach(r => {
      if (!r.getter_name) return;
      if (!byName[r.getter_name]) byName[r.getter_name] = [];
      byName[r.getter_name].push(r);
    });
    const result = {};
    Object.entries(byName).forEach(([name, calls]) => {
      const h = calcWorkHours(calls);
      if (h > 0) result[name] = h;
    });
    return result;
  }, [rankRecords]);

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

  // rankDateRangeでフィルタしたアポデータ（リスケ・キャンセル集計用）
  const reschedAppoData = useMemo(() => {
    if (!rankDateRange) return [];
    return (appoData || []).filter(a => {
      const d = (a.getDate || '').slice(0, 10);
      return d >= rankDateRange.from && d <= rankDateRange.to;
    });
  }, [appoData, rankDateRange]);

  const tabBtn = (active) => ({
    padding: '6px 12px', fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer',
    background: 'transparent', border: 'none',
    borderBottom: '2px solid ' + (active ? '#0D2247' : 'transparent'),
    color: active ? '#0D2247' : '#9CA3AF', borderRadius: 0, fontFamily: "'Noto Sans JP'",
    transition: 'all 0.15s',
  });
  const dateInputStyle = { padding: '3px 6px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, color: C.textDark, outline: 'none', fontFamily: "'Noto Sans JP'" };

  const simplePeriodSelector = (period, setPeriod, from, setFrom, to, setTo) => (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #E5E7EB' }}>
      {[['day', '日'], ['week', '週'], ['month', '月'], ['custom', '期間指定']].map(([k, l]) => (
        <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k)}>{l}</button>
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
      <div style={{ background: '#0D2247', borderRadius: 4, padding: '8px 12px', color: '#fff', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}週</div>
        <div>架電: {payload.find(p => p.dataKey === 'calls')?.value || 0}件</div>
        <div style={{ color: '#93C5FD' }}>接続: {payload.find(p => p.dataKey === 'connect')?.value || 0}件</div>
        <div style={{ color: '#9CA3AF' }}>アポ: {payload.find(p => p.dataKey === 'appo')?.value || 0}件</div>
      </div>
    );
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Performance</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>個人・チーム パフォーマンス分析</div>
      </div>

      {selectedPerson && (
        <PersonDetailModal
          person={selectedPerson}
          callRecords={rankRecords}
          appoRecords={appoRankRecords}
          sessions={sessionRecords}
          members={members}
          teamMap={teamMap}
          rankDateRange={rankDateRange}
          onClose={() => setSelectedPerson(null)}
        />
      )}

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
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid #0D2247', paddingBottom: 6 }}>成長トレンド（週次推移）</span>
          {trendLoading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
        </div>
        <ResponsiveContainer width='100%' height={200}>
          <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
            <XAxis dataKey='label' tick={{ fontSize: 9, fill: '#888' }} />
            <YAxis tick={{ fontSize: 9, fill: '#888' }} width={28} />
            <Tooltip content={<TrendTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type='monotone' dataKey='calls' stroke='#0D2247' strokeWidth={2} dot={{ r: 3 }} name='架電数' />
            <Line type='monotone' dataKey='connect' stroke='#1E40AF' strokeWidth={2} dot={{ r: 3 }} name='社長接続' />
            <Line type='monotone' dataKey='appo' stroke='#6B7280' strokeWidth={2} dot={{ r: 3 }} name='アポ' />
          </LineChart>
        </ResponsiveContainer>
      </div>


      {/* セクション3+5: ランキング・チーム分析 */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>活動ランキング・チーム分析</span>
            {rankLoading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
          </div>
          {simplePeriodSelector(rankPeriod, setRankPeriod, rankFrom, setRankFrom, rankTo, setRankTo)}
        </div>
        <ActivityRankingSection
          records={rankRecords}
          appoRecords={appoRankRecords}
          loading={rankLoading}
          currentUser={currentUser}
          sessionMap={sessionMap}
          onSelectPerson={setSelectedPerson}
        />
        <TeamPerformanceTable
          records={rankRecords}
          appoRecords={appoRankRecords}
          loading={rankLoading}
          teamMap={teamMap}
          sessionMap={sessionMap}
          reschedAppoData={reschedAppoData}
          members={members}
        />
      </div>


    </div>
  );
}
