import { useState, useEffect, useMemo, useRef } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { fetchCallRecordsForRanking } from '../../lib/supabaseWrite';
import { AVAILABLE_MONTHS } from '../../constants/availableMonths';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, ReferenceLine, Cell,
} from 'recharts';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const GOLD_LIGHT = '#e0c97a';
const COUNTABLE = new Set(['面談済', '事前確認済', 'アポ取得']);
const fmt = (n) => n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString();
const fmtFull = (n) => '¥' + (n || 0).toLocaleString();

// ── 期間の開始/終了 date string を返す ──────────────────────────────────
function getPeriodRange(period, selectedMonth, customFrom, customTo, todayStr, weekStartStr) {
  if (period === 'day') return { from: todayStr, to: todayStr };
  if (period === 'week') return { from: weekStartStr, to: todayStr };
  if (period === 'month') {
    const y = parseInt(selectedMonth.slice(0, 4));
    const m = parseInt(selectedMonth.slice(5, 7));
    const last = new Date(y, m, 0).getDate();
    return { from: selectedMonth + '-01', to: selectedMonth + '-' + String(last).padStart(2, '0') };
  }
  if (period === 'custom' && customFrom) {
    const f = customFrom + '-01';
    const ym = (customTo || customFrom) + '-01';
    const d = new Date(ym); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return { from: f, to: d.toISOString().slice(0, 10) };
  }
  return { from: '', to: '' };
}

// ── 前期間の開始/終了を返す ──────────────────────────────────────────────
function getPrevRange(period, selectedMonth, customFrom, customTo, todayStr, weekStartStr) {
  if (period === 'day') {
    const d = new Date(todayStr); d.setDate(d.getDate() - 1);
    const s = d.toISOString().slice(0, 10);
    return { from: s, to: s };
  }
  if (period === 'week') {
    const ws = new Date(weekStartStr); ws.setDate(ws.getDate() - 7);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    return { from: ws.toISOString().slice(0, 10), to: we.toISOString().slice(0, 10) };
  }
  if (period === 'month') {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    const ym = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
    const last = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
    return { from: ym + '-01', to: ym + '-' + String(last).padStart(2, '0') };
  }
  return null;
}

export default function StatsView({ callListData, currentUser, appoData, members, now: nowProp }) {
  const [callTab, setCallTab] = useState('team');
  const [callPeriod, setCallPeriod] = useState(() => localStorage.getItem('spanavi_stats_callPeriod') || 'week');
  const [callCustomFrom, setCallCustomFrom] = useState(() => localStorage.getItem('spanavi_stats_callFrom') || '');
  const [callCustomTo, setCallCustomTo] = useState(() => localStorage.getItem('spanavi_stats_callTo') || '');
  const [callSelectedMonth, setCallSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_stats_callMonth');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || '2026-03');
  });
  const [salesTab, setSalesTab] = useState('team');
  const [salesPeriod, setSalesPeriod] = useState(() => localStorage.getItem('spanavi_stats_salesPeriod') || 'month');
  const [salesCustomFrom, setSalesCustomFrom] = useState(() => localStorage.getItem('spanavi_stats_salesFrom') || '');
  const [salesCustomTo, setSalesCustomTo] = useState(() => localStorage.getItem('spanavi_stats_salesTo') || '');
  const [salesSelectedMonth, setSalesSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_stats_salesMonth');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || '2026-03');
  });
  const [salesChartTab, setSalesChartTab] = useState('daily');
  const [expandedClient, setExpandedClient] = useState(null);
  const [notification, setNotification] = useState(null);
  const lastNotifTime = useRef(0);

  useEffect(() => {
    localStorage.setItem('spanavi_stats_callPeriod', callPeriod);
    localStorage.setItem('spanavi_stats_callMonth', callSelectedMonth);
    localStorage.setItem('spanavi_stats_callFrom', callCustomFrom);
    localStorage.setItem('spanavi_stats_callTo', callCustomTo);
    localStorage.setItem('spanavi_stats_salesPeriod', salesPeriod);
    localStorage.setItem('spanavi_stats_salesMonth', salesSelectedMonth);
    localStorage.setItem('spanavi_stats_salesFrom', salesCustomFrom);
    localStorage.setItem('spanavi_stats_salesTo', salesCustomTo);
  }, [callPeriod, callSelectedMonth, callCustomFrom, callCustomTo,
      salesPeriod, salesSelectedMonth, salesCustomFrom, salesCustomTo]);

  const now = nowProp ? new Date(nowProp) : new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const todayD = new Date(todayStr);
  const dayOfWeek = todayD.getDay();
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - ((dayOfWeek + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);

  const inPeriod = (dateStr, period, customFrom, customTo, selectedMonth = monthStr) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (period === 'day') return d === todayStr;
    if (period === 'week') return d >= weekStartStr && d <= todayStr;
    if (period === 'month') return d.startsWith(selectedMonth);
    if (period === 'custom') {
      const dm = d.slice(0, 7);
      if (customFrom && dm < customFrom) return false;
      if (customTo && dm > customTo) return false;
      return true;
    }
    return true;
  };

  const inDateRange = (dateStr, from, to) => {
    if (!dateStr || !from) return false;
    const d = dateStr.slice(0, 10);
    return d >= from && d <= to;
  };

  // Supabase-based call records
  const [supaRecords, setSupaRecords] = useState([]);
  const [supaTodayRecords, setSupaTodayRecords] = useState([]);
  const [rankLoading, setRankLoading] = useState(false);

  const _jstStart = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
  const _jstEnd   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();

  useEffect(() => {
    let from, to;
    if (callPeriod === 'day') { from = _jstStart(todayStr); to = _jstEnd(todayStr); }
    else if (callPeriod === 'week') { from = _jstStart(weekStartStr); to = _jstEnd(todayStr); }
    else if (callPeriod === 'month') {
      const firstDay = callSelectedMonth + '-01';
      const d = new Date(firstDay); d.setMonth(d.getMonth() + 1); d.setDate(0);
      from = _jstStart(firstDay); to = _jstEnd(d.toISOString().slice(0, 10));
    } else if (callPeriod === 'custom' && callCustomFrom) {
      const fromDay = callCustomFrom + '-01';
      const toYM = (callCustomTo || callCustomFrom) + '-01';
      const d = new Date(toYM); d.setMonth(d.getMonth() + 1); d.setDate(0);
      from = _jstStart(fromDay); to = _jstEnd(d.toISOString().slice(0, 10));
    } else return;
    setRankLoading(true);
    fetchCallRecordsForRanking(from, to).then(({ data }) => { setSupaRecords(data); setRankLoading(false); });
  }, [callPeriod, callSelectedMonth, callCustomFrom, callCustomTo, todayStr, weekStartStr]);

  useEffect(() => {
    const load = () => fetchCallRecordsForRanking(_jstStart(todayStr), _jstEnd(todayStr)).then(({ data }) => setSupaTodayRecords(data));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [todayStr]);

  // teamMap
  const teamMap = useMemo(() => {
    const m = {};
    members.forEach(mb => { m[mb.name] = mb.team ? mb.team + 'チーム' : '営業統括'; });
    return m;
  }, [members]);

  // ── Sales filter ─────────────────────────────────────────────────────────
  const salesFiltered = useMemo(() => (appoData || []).filter(a => {
    if (!COUNTABLE.has(a.status)) return false;
    const d = a.meetDate || a.getDate || '';
    return inPeriod(d, salesPeriod, salesCustomFrom, salesCustomTo, salesSelectedMonth);
  }), [appoData, salesPeriod, salesCustomFrom, salesCustomTo, salesSelectedMonth, todayStr, weekStartStr]);

  // ── Previous period sales ─────────────────────────────────────────────────
  const prevSalesFiltered = useMemo(() => {
    const prev = getPrevRange(salesPeriod, salesSelectedMonth, salesCustomFrom, salesCustomTo, todayStr, weekStartStr);
    if (!prev) return [];
    return (appoData || []).filter(a => {
      if (!COUNTABLE.has(a.status)) return false;
      const d = (a.meetDate || a.getDate || '').slice(0, 10);
      return d >= prev.from && d <= prev.to;
    });
  }, [appoData, salesPeriod, salesSelectedMonth, salesCustomFrom, salesCustomTo, todayStr, weekStartStr]);

  // ── Summary cards ─────────────────────────────────────────────────────────
  const totalSales   = useMemo(() => salesFiltered.reduce((s, a) => s + (a.sales || 0), 0), [salesFiltered]);
  const totalAppo    = salesFiltered.length;
  const avgUnit      = totalAppo > 0 ? Math.round(totalSales / totalAppo) : 0;
  const prevSales    = useMemo(() => prevSalesFiltered.reduce((s, a) => s + (a.sales || 0), 0), [prevSalesFiltered]);
  const prevAppo     = prevSalesFiltered.length;
  const prevAvgUnit  = prevAppo > 0 ? Math.round(prevSales / prevAppo) : 0;
  const salesGrowth  = prevSales > 0 ? ((totalSales - prevSales) / prevSales * 100) : null;
  const appoGrowth   = prevAppo > 0 ? ((totalAppo - prevAppo) / prevAppo * 100) : null;
  const unitGrowth   = prevAvgUnit > 0 ? ((avgUnit - prevAvgUnit) / prevAvgUnit * 100) : null;

  // 今月着地予測（日次進捗から線形予測）
  const monthForecast = useMemo(() => {
    const ym = salesSelectedMonth || monthStr;
    const [y, m] = ym.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const elapsed = salesPeriod === 'month'
      ? Math.min(parseInt(todayStr.slice(8, 10)), daysInMonth)
      : null;
    if (!elapsed || elapsed === 0) return null;
    const monthData = (appoData || []).filter(a => {
      if (!COUNTABLE.has(a.status)) return false;
      const d = a.meetDate || a.getDate || '';
      return d.startsWith(ym);
    });
    const sofar = monthData.reduce((s, a) => s + (a.sales || 0), 0);
    return Math.round(sofar / elapsed * daysInMonth);
  }, [appoData, salesSelectedMonth, salesPeriod, monthStr, todayStr]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const dailyChartData = useMemo(() => {
    const ym = salesSelectedMonth || monthStr;
    const [y, m] = ym.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const ds = ym + '-' + String(i + 1).padStart(2, '0');
      const recs = (appoData || []).filter(a => COUNTABLE.has(a.status) && (a.meetDate || a.getDate || '').slice(0, 10) === ds);
      return { date: String(i + 1) + '日', sales: recs.reduce((s, a) => s + (a.sales || 0), 0), count: recs.length, isToday: ds === todayStr };
    });
  }, [appoData, salesSelectedMonth, monthStr, todayStr]);

  const weeklyChartData = useMemo(() => {
    const result = [];
    for (let w = 11; w >= 0; w--) {
      const start = new Date(todayD); start.setDate(start.getDate() - w * 7 - ((dayOfWeek + 6) % 7));
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const fs = start.toISOString().slice(0, 10);
      const fe = end.toISOString().slice(0, 10);
      const recs = (appoData || []).filter(a => {
        if (!COUNTABLE.has(a.status)) return false;
        const d = (a.meetDate || a.getDate || '').slice(0, 10);
        return d >= fs && d <= fe;
      });
      result.push({ label: fs.slice(5).replace('-', '/') + '週', sales: recs.reduce((s, a) => s + (a.sales || 0), 0), count: recs.length });
    }
    return result;
  }, [appoData, todayStr, dayOfWeek]);

  const monthlyChartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const recs = (appoData || []).filter(a => COUNTABLE.has(a.status) && (a.meetDate || a.getDate || '').startsWith(ym));
      return { label: ym.slice(2).replace('-', '/'), sales: recs.reduce((s, a) => s + (a.sales || 0), 0), count: recs.length };
    });
  }, [appoData]);

  // ── Individual / Team rank ────────────────────────────────────────────────
  const salesByIndiv = useMemo(() => {
    const m = {};
    salesFiltered.forEach(a => {
      const k = a.getter || '不明';
      if (!m[k]) m[k] = { total: 0, reward: 0, count: 0 };
      m[k].total += a.sales || 0; m[k].reward += a.reward || 0; m[k].count++;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }, [salesFiltered]);

  const salesByTeam = useMemo(() => {
    const m = {};
    salesFiltered.forEach(a => {
      const tn = teamMap[a.getter] || 'その他';
      if (!m[tn]) m[tn] = { total: 0, count: 0, members: new Set() };
      m[tn].total += a.sales || 0; m[tn].count++;
      if (a.getter) m[tn].members.add(a.getter);
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total).map(([tn, d]) => [tn, { ...d, memberCount: d.members.size }]);
  }, [salesFiltered, teamMap]);

  // ── Client analysis ───────────────────────────────────────────────────────
  const clientMap = useMemo(() => {
    const m = {};
    (callListData || []).forEach(cl => { if (cl._supaId) m[cl._supaId] = cl.client || cl._supaId; });
    return m;
  }, [callListData]);

  const clientData = useMemo(() => {
    const m = {};
    salesFiltered.forEach(a => {
      const key = a.clientId || a.client || '不明';
      const name = clientMap[key] || a.client || key;
      if (!m[key]) m[key] = { name, total: 0, count: 0, lastDate: '', items: {} };
      m[key].total += a.sales || 0; m[key].count++;
      const d = a.meetDate || a.getDate || '';
      if (d > m[key].lastDate) m[key].lastDate = d;
      const listKey = a.listId || 'その他';
      if (!m[key].items[listKey]) m[key].items[listKey] = { total: 0, count: 0 };
      m[key].items[listKey].total += a.sales || 0; m[key].items[listKey].count++;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }, [salesFiltered, clientMap]);

  // ── Call ranking ─────────────────────────────────────────────────────────
  const callByCaller = {};
  supaRecords.forEach(r => {
    const k = r.getter_name || '不明';
    if (!callByCaller[k]) callByCaller[k] = { total: 0, ceoConnect: 0, appo: 0 };
    callByCaller[k].total += Number(r.total) || 0;
    callByCaller[k].ceoConnect += Number(r.ceo_connect) || 0;
    callByCaller[k].appo += Number(r.appo) || 0;
  });
  const callIndiv = Object.entries(callByCaller).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total);
  const callIndivRanked = callIndiv.map((item, idx) => ({
    ...item,
    rank: (idx === 0 || item.total !== callIndiv[idx - 1]?.total) ? idx + 1 : callIndiv[idx - 1]?._rank || idx + 1,
    _rank: (idx === 0 || item.total !== callIndiv[idx - 1]?.total) ? idx + 1 : callIndiv[idx - 1]?._rank || idx + 1,
  }));
  const callByTeam = {};
  supaRecords.forEach(r => {
    const tn = teamMap[r.getter_name] || 'その他';
    if (!callByTeam[tn]) callByTeam[tn] = { total: 0, ceoConnect: 0, appo: 0 };
    callByTeam[tn].total += Number(r.total) || 0;
    callByTeam[tn].ceoConnect += Number(r.ceo_connect) || 0;
    callByTeam[tn].appo += Number(r.appo) || 0;
  });
  const callTeamRank = Object.entries(callByTeam).sort((a, b) => b[1].total - a[1].total);

  // ── Today realtime ────────────────────────────────────────────────────────
  const todayByCaller = {};
  supaTodayRecords.forEach(r => {
    const k = r.getter_name || '不明';
    todayByCaller[k] = { total: Number(r.total) || 0, ceoConnect: Number(r.ceo_connect) || 0, appo: 0, sales: todayByCaller[k]?.sales || 0 };
  });
  (appoData || []).forEach(a => {
    const gd = (a.getDate || '').slice(0, 10);
    if (gd === todayStr && a.status !== 'キャンセル') {
      const k = a.getter || '不明';
      if (!todayByCaller[k]) todayByCaller[k] = { total: 0, ceoConnect: 0, appo: 0, sales: 0 };
      todayByCaller[k].appo++;
    }
    if (!COUNTABLE.has(a.status)) return;
    const d = a.getDate || a.meetDate || '';
    if (d.slice(0, 10) !== todayStr) return;
    const k = a.getter || '不明';
    if (!todayByCaller[k]) todayByCaller[k] = { total: 0, ceoConnect: 0, appo: 0, sales: 0 };
    todayByCaller[k].sales += (a.sales || 0);
  });
  const todayRank = Object.entries(todayByCaller).map(([name, d]) => ({ name, ...d }));
  const rankByTotal = [...todayRank].sort((a, b) => b.total - a.total);
  const rankByCeo   = [...todayRank].sort((a, b) => b.ceoConnect - a.ceoConnect);
  const rankByAppo  = [...todayRank].sort((a, b) => b.appo - a.appo);
  const rankBySales = [...todayRank].sort((a, b) => b.sales - a.sales);

  const salesIndivRank = salesByIndiv; // alias
  const maxIndivSales  = salesIndivRank.length > 0 ? salesIndivRank[0][1].total : 1;
  const salesTeamRank  = salesByTeam;

  useEffect(() => {
    const interval = setInterval(() => {
      const nowMs = Date.now();
      if (nowMs - lastNotifTime.current < 29 * 60 * 1000) return;
      lastNotifTime.current = nowMs;
      const topCall = rankByTotal[0]; const topCeo = rankByCeo[0]; const topAppo = rankByAppo[0];
      if (!topCall) return;
      setNotification({
        time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        callChamp: topCall ? topCall.name + '（' + topCall.total + '件）' : '-',
        ceoChamp: topCeo && topCeo.ceoConnect > 0 ? topCeo.name + '（' + topCeo.ceoConnect + '件）' : '-',
        appoChamp: topAppo && topAppo.appo > 0 ? topAppo.name + '（' + topAppo.appo + '件）' : '-',
      });
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [supaTodayRecords.length]);

  // ── Shared UI ─────────────────────────────────────────────────────────────
  const inputStyle = { padding: '6px 10px', borderRadius: 5, background: C.white, border: '1px solid ' + C.border, color: C.textDark, fontSize: 11, fontFamily: "'Noto Sans JP'", outline: 'none' };
  const tabBtn = (active, color) => ({
    padding: '5px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Noto Sans JP'", border: '1px solid ' + (active ? color : C.border),
    background: active ? color : C.white, color: active ? C.white : C.textMid,
  });
  const monthSelectStyle = { padding: '3px 6px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, color: C.textDark, outline: 'none', fontFamily: "'Noto Sans JP'" };
  const rankBadge = (rank) => ({
    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: rank <= 3 ? 12 : 9, fontWeight: 700, flexShrink: 0,
    background: rank === 1 ? C.gold : rank === 2 ? '#C0C0C0' : rank === 3 ? '#cd7f32' : C.offWhite,
    color: rank <= 3 ? C.white : C.textLight,
    border: rank <= 3 ? 'none' : '1px solid ' + C.borderLight,
  });

  const periodSelector = (period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, selectedMonth, setSelectedMonth, accent) => (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {[['week', '週'], ['month', '月'], ['custom', '期間指定']].map(([k, l]) => (
        <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k, accent)}>{l}</button>
      ))}
      {period === 'month' && (
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={monthSelectStyle}>
          {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
        </select>
      )}
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={monthSelectStyle}>
            <option value=''>開始月</option>
            {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
          </select>
          <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
          <select value={customTo} onChange={e => setCustomTo(e.target.value)} style={monthSelectStyle}>
            <option value=''>終了月</option>
            {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );

  const GrowthBadge = ({ pct }) => {
    if (pct === null) return <span style={{ fontSize: 10, color: C.textLight }}>前期比 —</span>;
    const up = pct >= 0;
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: up ? '#16a34a' : '#dc2626' }}>
        {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

  const cardStyle = { background: C.white, borderRadius: 12, padding: '20px 22px', boxShadow: '0 2px 10px rgba(13,34,71,0.07)', borderTop: '3px solid ' + GOLD, animation: 'fadeIn 0.3s ease' };

  const CustomBarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: NAVY, borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div>売上: {fmtFull(payload[0]?.value)}</div>
        {payload[0]?.payload?.count != null && <div>アポ数: {payload[0].payload.count}件</div>}
      </div>
    );
  };

  const CustomLineTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: NAVY, borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div>売上: {fmtFull(payload[0]?.value)}</div>
        {payload[0]?.payload?.count != null && <div>アポ数: {payload[0].payload.count}件</div>}
      </div>
    );
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>

      {/* ========== 通知バナー ========== */}
      {notification && (
        <div style={{ background: 'linear-gradient(135deg, ' + C.navyDeep + ', ' + C.navy + ')', borderRadius: 10, padding: '14px 20px', marginBottom: 16, color: C.white, position: 'relative', animation: 'slideIn 0.4s ease' }}>
          <button onClick={() => setNotification(null)} style={{ position: 'absolute', top: 8, right: 12, background: 'transparent', border: 'none', color: C.white + '80', cursor: 'pointer', fontSize: 14 }}>×</button>
          <div style={{ fontSize: 10, color: C.goldLight, marginBottom: 6 }}>🏆 {notification.time} 時点のランキング速報</div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
            <span>📞 架電1位: <b style={{ color: C.goldLight }}>{notification.callChamp}</b></span>
            <span>👔 接続1位: <b style={{ color: C.goldLight }}>{notification.ceoChamp}</b></span>
            <span>🎯 アポ1位: <b style={{ color: C.goldLight }}>{notification.appoChamp}</b></span>
          </div>
        </div>
      )}

      {/* ========== セクション1: 売上サマリーカード ========== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {/* ① 累計売上 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>💰 累計売上</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'", letterSpacing: '-0.5px' }}>
            {totalSales >= 10000 ? <>{(totalSales / 10000).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}>万円</span></> : fmtFull(totalSales)}
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <GrowthBadge pct={salesGrowth} />
            {prevSales > 0 && <span style={{ fontSize: 10, color: C.textLight }}>前期: {fmt(prevSales)}</span>}
          </div>
        </div>
        {/* ② アポ取得数 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>🎯 アポ取得数</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'" }}>
            {totalAppo}<span style={{ fontSize: 13, fontWeight: 600 }}>件</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <GrowthBadge pct={appoGrowth} />
            {prevAppo > 0 && <span style={{ fontSize: 10, color: C.textLight }}>前期: {prevAppo}件</span>}
          </div>
        </div>
        {/* ③ 平均単価 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>📊 平均単価</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'" }}>
            {avgUnit >= 10000 ? <>{(avgUnit / 10000).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}>万円</span></> : fmtFull(avgUnit)}
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <GrowthBadge pct={unitGrowth} />
            {prevAvgUnit > 0 && <span style={{ fontSize: 10, color: C.textLight }}>前期: {fmt(prevAvgUnit)}</span>}
          </div>
        </div>
        {/* ④ 今月着地予測 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>🔭 今月着地予測</div>
          {monthForecast !== null ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 900, color: GOLD, fontFamily: "'JetBrains Mono'" }}>
                {monthForecast >= 10000 ? <>{(monthForecast / 10000).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}>万円</span></> : fmtFull(monthForecast)}
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: C.textLight }}>
                現在: {fmt(totalSales)} / 予測ベース: {salesSelectedMonth || monthStr}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.textLight, marginTop: 8 }}>月次フィルタ時に表示</div>
          )}
        </div>
      </div>

      {/* ========== セクション2: 売上推移グラフ ========== */}
      <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px', marginBottom: 20, boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📈</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>売上推移グラフ</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['daily', '日次'], ['weekly', '週次'], ['monthly', '月次']].map(([k, l]) => (
              <button key={k} onClick={() => setSalesChartTab(k)} style={tabBtn(salesChartTab === k, GOLD)}>{l}</button>
            ))}
            {salesChartTab === 'daily' && (
              <select value={salesSelectedMonth} onChange={e => setSalesSelectedMonth(e.target.value)} style={{ ...monthSelectStyle, marginLeft: 8 }}>
                {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
              </select>
            )}
          </div>
        </div>

        {salesChartTab === 'daily' && (
          <ResponsiveContainer width='100%' height={280}>
            <BarChart data={dailyChartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
              <XAxis dataKey='date' tick={{ fontSize: 9, fill: '#888' }} interval={1} />
              <YAxis tickFormatter={v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v} tick={{ fontSize: 9, fill: '#888' }} />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey='sales' radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 8, fill: '#888', formatter: (v, _, props) => props?.count > 0 ? props.count + '件' : '' }}>
                {dailyChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.isToday ? GOLD : NAVY} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {salesChartTab === 'weekly' && (
          <ResponsiveContainer width='100%' height={280}>
            <AreaChart data={weeklyChartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id='weekGrad' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor={NAVY} stopOpacity={0.15} />
                  <stop offset='95%' stopColor={NAVY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
              <XAxis dataKey='label' tick={{ fontSize: 9, fill: '#888' }} />
              <YAxis tickFormatter={v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v} tick={{ fontSize: 9, fill: '#888' }} />
              <Tooltip content={<CustomLineTooltip />} />
              <Area type='monotone' dataKey='sales' stroke={NAVY} strokeWidth={2} fill='url(#weekGrad)' dot={{ r: 4, fill: NAVY }} activeDot={{ r: 6, fill: GOLD }} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {salesChartTab === 'monthly' && (
          <ResponsiveContainer width='100%' height={280}>
            <BarChart data={monthlyChartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
              <XAxis dataKey='label' tick={{ fontSize: 9, fill: '#888' }} />
              <YAxis tickFormatter={v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v} tick={{ fontSize: 9, fill: '#888' }} />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey='sales' fill={NAVY} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ========== セクション3: 個人・チーム別ランキング ========== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {/* 個人売上ランキング */}
        <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15 }}>🏅</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>個人売上ランキング</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {periodSelector(salesPeriod, setSalesPeriod, salesCustomFrom, setSalesCustomFrom, salesCustomTo, setSalesCustomTo, salesSelectedMonth, setSalesSelectedMonth, GOLD)}
            </div>
          </div>
          {salesIndivRank.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
          ) : salesIndivRank.map(([name, d], idx) => {
            const isMe = name === currentUser;
            const barPct = maxIndivSales > 0 ? Math.max(d.total / maxIndivSales * 100, 2) : 2;
            const medalBg = idx === 0 ? 'linear-gradient(135deg,#C8A84B,#e0c97a)' : idx === 1 ? 'linear-gradient(135deg,#b0b0b0,#d8d8d8)' : idx === 2 ? 'linear-gradient(135deg,#cd7f32,#e8a060)' : C.offWhite;
            return (
              <div key={name} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: isMe ? NAVY + '08' : 'transparent', borderLeft: isMe ? '3px solid ' + GOLD : '3px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: idx < 3 ? 11 : 9, fontWeight: 700, background: medalBg, color: idx < 3 ? '#fff' : C.textLight, flexShrink: 0 }}>
                    {idx === 0 ? '👑' : idx + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isMe ? 700 : 500, color: isMe ? NAVY : C.textDark }}>{name}{isMe ? ' ★' : ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "'JetBrains Mono'", color: GOLD }}>{fmt(d.total)}</span>
                  <span style={{ fontSize: 10, color: C.textLight }}>{d.count}件</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: C.offWhite, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: idx === 0 ? 'linear-gradient(90deg,' + GOLD + ',' + GOLD_LIGHT + ')' : 'linear-gradient(90deg,' + NAVY + ',#1a3a6b)', width: barPct + '%', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* チーム別売上ランキング */}
        <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 15 }}>🏢</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>チーム別売上ランキング</span>
          </div>
          {salesTeamRank.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
          ) : salesTeamRank.map(([tn, d], idx) => {
            const maxTeam = salesTeamRank[0]?.[1]?.total || 1;
            const barPct = Math.max(d.total / maxTeam * 100, 2);
            const medalBg = idx === 0 ? 'linear-gradient(135deg,#C8A84B,#e0c97a)' : idx === 1 ? 'linear-gradient(135deg,#b0b0b0,#d8d8d8)' : idx === 2 ? 'linear-gradient(135deg,#cd7f32,#e8a060)' : C.offWhite;
            return (
              <div key={tn} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: idx < 3 ? 11 : 9, fontWeight: 700, background: medalBg, color: idx < 3 ? '#fff' : C.textLight, flexShrink: 0 }}>
                    {idx === 0 ? '👑' : idx + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: NAVY }}>{tn}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "'JetBrains Mono'", color: GOLD }}>{fmt(d.total)}</span>
                  <span style={{ fontSize: 10, color: C.textLight }}>{d.count}件 / {d.memberCount}人</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: C.offWhite, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: idx === 0 ? 'linear-gradient(90deg,' + GOLD + ',' + GOLD_LIGHT + ')' : 'linear-gradient(90deg,' + NAVY + ',#1a3a6b)', width: barPct + '%', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========== セクション4: クライアント別売上分析 ========== */}
      <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px', marginBottom: 20, boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 16 }}>🏛️</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>クライアント別売上分析</span>
          <span style={{ fontSize: 10, color: C.textLight }}>({clientData.length}社 / {salesFiltered.length}件)</span>
        </div>
        <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1.2fr 1fr 1fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', letterSpacing: '0.06em', borderBottom: '2px solid #E5E5E5' }}>
            <span>クライアント名</span><span>アポ数</span><span>売上合計</span><span>平均単価</span><span>最終アポ日</span>
          </div>
          {clientData.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
          ) : clientData.map(([key, d], idx) => {
            const isExpanded = expandedClient === key;
            const avg = d.count > 0 ? Math.round(d.total / d.count) : 0;
            return (
              <React.Fragment key={key}>
                <div
                  onClick={() => setExpandedClient(isExpanded ? null : key)}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1.2fr 1fr 1fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2', cursor: 'pointer', background: isExpanded ? NAVY + '06' : idx % 2 === 0 ? 'transparent' : '#FAFAFA', transition: 'background 0.15s' }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#EAF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? NAVY + '06' : idx % 2 === 0 ? 'transparent' : '#FAFAFA'; }}
                >
                  <span style={{ fontWeight: 600, color: NAVY, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, color: C.textLight, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
                    {d.name}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{d.count}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 900, color: GOLD }}>{fmt(d.total)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.textDark }}>{fmt(avg)}</span>
                  <span style={{ fontSize: 11, color: C.textMid }}>{d.lastDate?.slice(0, 10) || '—'}</span>
                </div>
                {isExpanded && (
                  <div style={{ borderBottom: '1px solid #E5E5E5', background: NAVY + '04', padding: '8px 24px 12px' }}>
                    <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>リスト別内訳</div>
                    {Object.entries(d.items).map(([listId, ld]) => (
                      <div key={listId} style={{ display: 'flex', gap: 16, padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 11 }}>
                        <span style={{ flex: 1, color: C.textDark }}>{listId}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", color: C.textMid }}>{ld.count}件</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: GOLD }}>{fmt(ld.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ========== 本日のリアルタイムランキング ========== */}
      <div style={{ background: C.white, borderRadius: 10, padding: '16px 20px', marginBottom: 20, border: '1px solid ' + C.gold + '30', boxShadow: '0 2px 8px ' + C.gold + '10' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 16 }}>🔥</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>本日のリアルタイムランキング</span>
          <span style={{ fontSize: 10, color: C.textLight }}>{supaTodayRecords.reduce((s, r) => s + Number(r.total), 0)}件の架電</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          {[
            { title: '架電件数', data: rankByTotal, key: 'total', emoji: '📞' },
            { title: '社長接続', data: rankByCeo, key: 'ceoConnect', emoji: '👔' },
            { title: 'アポ取得', data: rankByAppo, key: 'appo', emoji: '🎯' },
            { title: '売上', data: rankBySales, key: 'sales', emoji: '💰', fmt: 'money' },
          ].map((cat) => (
            <div key={cat.key} style={{ background: C.offWhite, borderRadius: 8, overflow: 'hidden', border: '1px solid ' + C.borderLight }}>
              <div style={{ padding: '8px 12px', background: C.navy + '08', fontSize: 11, fontWeight: 700, color: C.navy, borderBottom: '1px solid ' + C.borderLight }}>
                {cat.emoji} {cat.title}
              </div>
              {cat.data.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: C.textLight }}>データなし</div>
              ) : cat.data.map((p, i) => {
                const isFirst = i === 0 && p[cat.key] > 0;
                return (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: isFirst ? C.gold + '12' : 'transparent', borderBottom: '1px solid ' + C.borderLight + '60' }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isFirst ? 12 : 9, fontWeight: 700, flexShrink: 0, background: isFirst ? C.gold : C.offWhite, color: isFirst ? C.white : C.textLight, border: isFirst ? 'none' : '1px solid ' + C.borderLight }}>{isFirst ? '👑' : i + 1}</span>
                    <span style={{ fontSize: 11, fontWeight: isFirst ? 700 : 400, color: isFirst ? C.navy : C.textDark, flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'JetBrains Mono'", color: isFirst ? C.gold : C.navy }}>
                      {cat.fmt === 'money' ? (p[cat.key] / 10000).toFixed(1) + '万' : p[cat.key]}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ========== 架電ランキング ========== */}
      <div style={{ background: C.white, borderRadius: 10, padding: '18px 20px', marginBottom: 20, border: '1px solid ' + C.borderLight, boxShadow: '0 2px 8px rgba(26,58,92,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📞</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>架電ランキング</span>
            <span style={{ fontSize: 10, color: C.textLight }}>({supaRecords.reduce((s, r) => s + Number(r.total), 0)}件)</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {periodSelector(callPeriod, setCallPeriod, callCustomFrom, setCallCustomFrom, callCustomTo, setCallCustomTo, callSelectedMonth, setCallSelectedMonth, C.navy)}
            <div style={{ width: 1, height: 18, background: C.border, margin: '0 4px' }} />
            {['team', 'individual', 'chart'].map(t => (
              <button key={t} onClick={() => setCallTab(t)} style={tabBtn(callTab === t, C.navy)}>
                {t === 'team' ? 'チーム別' : t === 'individual' ? '個人別' : 'グラフ'}
              </button>
            ))}
          </div>
        </div>
        {callTab === 'team' && (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '36px 1.5fr 0.8fr 0.8fr 0.8fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', borderBottom: '2px solid #E5E5E5' }}>
              <span>#</span><span>チーム</span><span>架電件数</span><span>社長接続</span><span>アポ取得</span>
            </div>
            {callTeamRank.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
              : callTeamRank.map(([tn, d], idx) => (
                <div key={tn} style={{ display: 'grid', gridTemplateColumns: '36px 1.5fr 0.8fr 0.8fr 0.8fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2' }} onMouseEnter={e => e.currentTarget.style.background = '#EAF4FF'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={rankBadge(idx + 1)}>{idx === 0 ? '👑' : idx + 1}</span>
                  <span style={{ fontWeight: 700, color: C.navy }}>{tn}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{d.total}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{d.ceoConnect}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.gold }}>{d.appo}</span>
                </div>
              ))}
          </div>
        )}
        {callTab === 'individual' && (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '36px 1.2fr 0.8fr 0.8fr 0.8fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', borderBottom: '2px solid #E5E5E5' }}>
              <span>#</span><span>名前</span><span>架電件数</span><span>社長接続</span><span>アポ取得</span>
            </div>
            {callIndivRanked.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
              : callIndivRanked.map((p, idx) => {
                const isMe = p.name === currentUser;
                return (
                  <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '36px 1.2fr 0.8fr 0.8fr 0.8fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2', background: isMe ? C.navy + '08' : 'transparent', borderLeft: isMe ? '3px solid ' + C.navy : '3px solid transparent' }}>
                    <span style={rankBadge(idx + 1)}>{idx === 0 ? '👑' : idx + 1}</span>
                    <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? C.navy : C.textDark }}>{p.name}{isMe ? ' ★' : ''}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{p.total}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{p.ceoConnect}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: C.gold }}>{p.appo}</span>
                  </div>
                );
              })}
          </div>
        )}
        {callTab === 'chart' && (
          <div style={{ borderRadius: 8, border: '1px solid ' + C.borderLight, padding: '16px 14px' }}>
            {callIndivRanked.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
              : callIndivRanked.map((p, idx) => {
                const maxVal = callIndivRanked[0]?.total || 1;
                return (
                  <div key={p.name} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 10, width: 18, textAlign: 'right', color: idx === 0 ? C.gold : C.textLight }}>{idx + 1}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.textDark, width: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ height: 18, borderRadius: 3, background: 'linear-gradient(90deg,' + C.navy + ',' + C.navyLight + ')', width: Math.max(p.total / maxVal * 100, 2) + '%', transition: 'width 0.4s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
                          {p.total / maxVal > 0.2 && <span style={{ fontSize: 8, fontWeight: 700, color: C.white }}>{p.total}</span>}
                        </div>
                        <span style={{ fontSize: 9, color: C.textMid, whiteSpace: 'nowrap' }}>{p.total}件 / 接続{p.ceoConnect} / アポ{p.appo}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ========== 売上ランキング（既存） ========== */}
      <div style={{ background: C.white, borderRadius: 10, padding: '18px 20px', marginBottom: 20, border: '1px solid ' + C.borderLight, boxShadow: '0 2px 8px rgba(26,58,92,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>💰</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>売上ランキング</span>
            <span style={{ fontSize: 10, color: C.textLight }}>（有効ステータスのみ / {salesFiltered.length}件）</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {periodSelector(salesPeriod, setSalesPeriod, salesCustomFrom, setSalesCustomFrom, salesCustomTo, setSalesCustomTo, salesSelectedMonth, setSalesSelectedMonth, C.gold)}
            <div style={{ width: 1, height: 18, background: C.border, margin: '0 4px' }} />
            {['team', 'individual', 'chart'].map(t => (
              <button key={t} onClick={() => setSalesTab(t)} style={tabBtn(salesTab === t, C.gold)}>
                {t === 'team' ? 'チーム別' : t === 'individual' ? '個人別' : 'グラフ'}
              </button>
            ))}
          </div>
        </div>
        {salesTab === 'team' && (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '36px 1.5fr 0.6fr 1fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', borderBottom: '2px solid #E5E5E5' }}>
              <span>#</span><span>チーム</span><span>件数</span><span>売上</span>
            </div>
            {salesTeamRank.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
              : salesTeamRank.map(([tn, d], idx) => (
                <div key={tn} style={{ display: 'grid', gridTemplateColumns: '36px 1.5fr 0.6fr 1fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2' }} onMouseEnter={e => e.currentTarget.style.background = '#EAF4FF'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={rankBadge(idx + 1)}>{idx === 0 ? '👑' : idx + 1}</span>
                  <span style={{ fontWeight: 700, color: C.navy }}>{tn}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{d.count}</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 900, color: C.gold }}>{(d.total / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万円</span></span>
                </div>
              ))}
          </div>
        )}
        {salesTab === 'individual' && (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '36px 1.2fr 0.6fr 0.8fr 0.8fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', borderBottom: '2px solid #E5E5E5' }}>
              <span>#</span><span>名前</span><span>件数</span><span>売上</span><span>報酬</span>
            </div>
            {salesIndivRank.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
              : salesIndivRank.map(([name, d], idx) => {
                const isMe = name === currentUser;
                return (
                  <div key={name} style={{ display: 'grid', gridTemplateColumns: '36px 1.2fr 0.6fr 0.8fr 0.8fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2', background: isMe ? C.gold + '08' : 'transparent', borderLeft: isMe ? '3px solid ' + C.gold : '3px solid transparent' }}>
                    <span style={rankBadge(idx + 1)}>{idx === 0 ? '👑' : idx + 1}</span>
                    <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? C.navy : C.textDark }}>{name}{isMe ? ' ★' : ''}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{d.count}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 900, color: C.gold }}>{(d.total / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万</span></span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, color: C.green }}>{(d.reward / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万</span></span>
                  </div>
                );
              })}
          </div>
        )}
        {salesTab === 'chart' && (
          <div style={{ borderRadius: 8, border: '1px solid ' + C.borderLight, padding: '16px 14px' }}>
            {salesIndivRank.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
              : salesIndivRank.map(([name, d], idx) => {
                const barMax = maxIndivSales > 0 ? maxIndivSales : 1;
                return (
                  <div key={name} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 10, width: 18, textAlign: 'right', color: idx === 0 ? C.gold : C.textLight }}>{idx + 1}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.textDark, width: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ height: 18, borderRadius: 3, background: 'linear-gradient(90deg,' + C.gold + ',' + C.goldLight + ')', width: Math.max(d.total / barMax * 100, 2) + '%', transition: 'width 0.4s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
                          {d.total / barMax > 0.2 && <span style={{ fontSize: 8, fontWeight: 700, color: C.white }}>{d.count}件</span>}
                        </div>
                        <span style={{ fontSize: 9, color: C.gold, fontWeight: 700, whiteSpace: 'nowrap' }}>{(d.total / 10000).toFixed(1)}万</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

    </div>
  );
}
