import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { C } from '../../constants/colors';
import { fetchCallRecordsForRanking } from '../../lib/supabaseWrite';
import { AVAILABLE_MONTHS } from '../../constants/availableMonths';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, Cell,
} from 'recharts';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const GOLD_LIGHT = '#e0c97a';
const COUNTABLE = new Set(['面談済', '事前確認済', 'アポ取得']);
const fmt = (n) => n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString();
const fmtFull = (n) => '¥' + (n || 0).toLocaleString();

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
  // ── 架電・売上ランキング統合セクション用 ──────────────────────────────────
  const [callSalesPeriod, setCallSalesPeriod] = useState(() => localStorage.getItem('spanavi_stats_callSalesPeriod') || 'week');
  const [callSalesCustomFrom, setCallSalesCustomFrom] = useState(() => localStorage.getItem('spanavi_stats_callSalesFrom') || '');
  const [callSalesCustomTo, setCallSalesCustomTo] = useState(() => localStorage.getItem('spanavi_stats_callSalesTo') || '');
  const [mainTab, setMainTab] = useState('call');
  const [callSubTab, setCallSubTab] = useState('team');
  const [salesSubTab, setSalesSubTab] = useState('team');

  // ── サマリーカード用（独立維持） ──────────────────────────────────────────
  const [salesPeriod, setSalesPeriod] = useState(() => localStorage.getItem('spanavi_stats_salesPeriod') || 'month');
  const [salesCustomFrom, setSalesCustomFrom] = useState(() => localStorage.getItem('spanavi_stats_salesFrom') || '');
  const [salesCustomTo, setSalesCustomTo] = useState(() => localStorage.getItem('spanavi_stats_salesTo') || '');
  const [salesSelectedMonth, setSalesSelectedMonth] = useState(() => {
    const s = localStorage.getItem('spanavi_stats_salesMonth');
    return (s && AVAILABLE_MONTHS.some(m => m.yyyymm === s)) ? s : (AVAILABLE_MONTHS[0]?.yyyymm || '2026-03');
  });

  // ── ① 売上推移グラフ ─────────────────────────────────────────────────────
  const [chartTab, setChartTab] = useState('monthly');
  const [chartMonthStr, setChartMonthStr] = useState(() => AVAILABLE_MONTHS[0]?.yyyymm || '2026-03');
  const [chartCustomFrom, setChartCustomFrom] = useState('');
  const [chartCustomTo, setChartCustomTo] = useState('');

  // ── ② 個人売上ランキング ──────────────────────────────────────────────────
  const [rankPersonPeriod, setRankPersonPeriod] = useState('week');
  const [rankPersonFrom, setRankPersonFrom] = useState('');
  const [rankPersonTo, setRankPersonTo] = useState('');

  // ── ③ チーム別売上ランキング ──────────────────────────────────────────────
  const [rankTeamPeriod, setRankTeamPeriod] = useState('week');
  const [rankTeamFrom, setRankTeamFrom] = useState('');
  const [rankTeamTo, setRankTeamTo] = useState('');

  // ── ④ クライアント別売上分析 ──────────────────────────────────────────────
  const [rankClientPeriod, setRankClientPeriod] = useState('week');
  const [rankClientFrom, setRankClientFrom] = useState('');
  const [rankClientTo, setRankClientTo] = useState('');

  const [expandedClient, setExpandedClient] = useState(null);

  useEffect(() => {
    localStorage.setItem('spanavi_stats_callSalesPeriod', callSalesPeriod);
    localStorage.setItem('spanavi_stats_callSalesFrom', callSalesCustomFrom);
    localStorage.setItem('spanavi_stats_callSalesTo', callSalesCustomTo);
    localStorage.setItem('spanavi_stats_salesPeriod', salesPeriod);
    localStorage.setItem('spanavi_stats_salesMonth', salesSelectedMonth);
    localStorage.setItem('spanavi_stats_salesFrom', salesCustomFrom);
    localStorage.setItem('spanavi_stats_salesTo', salesCustomTo);
  }, [callSalesPeriod, callSalesCustomFrom, callSalesCustomTo,
      salesPeriod, salesSelectedMonth, salesCustomFrom, salesCustomTo]);

  const now = nowProp ? new Date(nowProp) : new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const todayD = new Date(todayStr);
  const dayOfWeek = todayD.getDay();
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - ((dayOfWeek + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);

  // サマリーカード・旧売上ランキング用 inPeriod
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

  // セクション独立フィルタ (日/週/月/期間指定)
  const filterBySimplePeriod = (dateStr, period, from, to) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (period === 'day') return d === todayStr;
    if (period === 'week') return d >= weekStartStr && d <= todayStr;
    if (period === 'month') return d >= monthStr + '-01' && d <= todayStr;
    if (period === 'custom') return (!from || d >= from) && (!to || d <= to);
    return false;
  };

  // ── 架電ランキング用 Supabase データ ──────────────────────────────────────
  const [supaRecords, setSupaRecords] = useState([]);
  const [rankLoading, setRankLoading] = useState(false);
  const _jstStart = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
  const _jstEnd   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();

  useEffect(() => {
    let from, to;
    if (callSalesPeriod === 'day') { from = _jstStart(todayStr); to = _jstEnd(todayStr); }
    else if (callSalesPeriod === 'week') { from = _jstStart(weekStartStr); to = _jstEnd(todayStr); }
    else if (callSalesPeriod === 'month') { from = _jstStart(monthStr + '-01'); to = _jstEnd(todayStr); }
    else if (callSalesPeriod === 'custom' && callSalesCustomFrom) {
      const fromDay = callSalesCustomFrom + '-01';
      const toYM = (callSalesCustomTo || callSalesCustomFrom) + '-01';
      const d = new Date(toYM); d.setMonth(d.getMonth() + 1); d.setDate(0);
      from = _jstStart(fromDay); to = _jstEnd(d.toISOString().slice(0, 10));
    } else return;
    setRankLoading(true);
    fetchCallRecordsForRanking(from, to).then(({ data }) => { setSupaRecords(data); setRankLoading(false); });
  }, [callSalesPeriod, callSalesCustomFrom, callSalesCustomTo, todayStr, weekStartStr, monthStr]);

  const teamMap = useMemo(() => {
    const m = {};
    members.forEach(mb => { m[mb.name] = mb.team ? mb.team + 'チーム' : '営業統括'; });
    return m;
  }, [members]);

  // ── サマリーカード用 (salesPeriod) ────────────────────────────────────────
  const salesFiltered = useMemo(() => (appoData || []).filter(a => {
    if (!COUNTABLE.has(a.status)) return false;
    return inPeriod(a.getDate || '', salesPeriod, salesCustomFrom, salesCustomTo, salesSelectedMonth);
  }), [appoData, salesPeriod, salesCustomFrom, salesCustomTo, salesSelectedMonth, todayStr, weekStartStr]);

  const prevSalesFiltered = useMemo(() => {
    const prev = getPrevRange(salesPeriod, salesSelectedMonth, salesCustomFrom, salesCustomTo, todayStr, weekStartStr);
    if (!prev) return [];
    return (appoData || []).filter(a => {
      if (!COUNTABLE.has(a.status)) return false;
      const d = (a.getDate || '').slice(0, 10);
      return d >= prev.from && d <= prev.to;
    });
  }, [appoData, salesPeriod, salesSelectedMonth, salesCustomFrom, salesCustomTo, todayStr, weekStartStr]);

  const totalSales  = useMemo(() => salesFiltered.reduce((s, a) => s + (a.sales || 0), 0), [salesFiltered]);
  const totalAppo   = salesFiltered.length;
  const avgUnit     = totalAppo > 0 ? Math.round(totalSales / totalAppo) : 0;
  const prevSales   = useMemo(() => prevSalesFiltered.reduce((s, a) => s + (a.sales || 0), 0), [prevSalesFiltered]);
  const prevAppo    = prevSalesFiltered.length;
  const prevAvgUnit = prevAppo > 0 ? Math.round(prevSales / prevAppo) : 0;
  const salesGrowth = prevSales > 0 ? ((totalSales - prevSales) / prevSales * 100) : null;
  const appoGrowth  = prevAppo > 0 ? ((totalAppo - prevAppo) / prevAppo * 100) : null;
  const unitGrowth  = prevAvgUnit > 0 ? ((avgUnit - prevAvgUnit) / prevAvgUnit * 100) : null;

  // 今月着地予測 (常に当月データ)
  const monthForecast = useMemo(() => {
    const ym = monthStr;
    const [y, m] = ym.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const elapsed = Math.min(parseInt(todayStr.slice(8, 10)), daysInMonth);
    if (!elapsed) return null;
    const sofar = (appoData || []).filter(a => {
      if (!COUNTABLE.has(a.status)) return false;
      const d = a.getDate || '';
      return d.startsWith(ym) && d.slice(0, 10) <= todayStr;
    }).reduce((s, a) => s + (a.sales || 0), 0);
    return Math.round(sofar / elapsed * daysInMonth);
  }, [appoData, monthStr, todayStr]);

  // ── ① 売上推移グラフ用データ ──────────────────────────────────────────────
  const dailyChartData = useMemo(() => {
    const ym = chartMonthStr;
    const [y, m] = ym.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const ds = ym + '-' + String(i + 1).padStart(2, '0');
      const recs = (appoData || []).filter(a => COUNTABLE.has(a.status) && (a.getDate || '').slice(0, 10) === ds);
      return { date: String(i + 1) + '日', sales: recs.reduce((s, a) => s + (a.sales || 0), 0), count: recs.length, isToday: ds === todayStr };
    });
  }, [appoData, chartMonthStr, todayStr]);

  const weeklyChartData = useMemo(() => {
    const result = [];
    for (let w = 11; w >= 0; w--) {
      const start = new Date(todayD); start.setDate(start.getDate() - w * 7 - ((dayOfWeek + 6) % 7));
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const fs = start.toISOString().slice(0, 10);
      const fe = end.toISOString().slice(0, 10);
      const recs = (appoData || []).filter(a => {
        if (!COUNTABLE.has(a.status)) return false;
        const d = (a.getDate || '').slice(0, 10);
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
      const recs = (appoData || []).filter(a => COUNTABLE.has(a.status) && (a.getDate || '').startsWith(ym));
      return { label: ym.slice(2).replace('-', '/'), sales: recs.reduce((s, a) => s + (a.sales || 0), 0), count: recs.length };
    });
  }, [appoData]);

  const customChartData = useMemo(() => {
    if (!chartCustomFrom || !chartCustomTo) return [];
    const result = [];
    const cur = new Date(chartCustomFrom);
    const end = new Date(chartCustomTo);
    if (cur > end) return [];
    while (cur <= end) {
      const ds = cur.toISOString().slice(0, 10);
      const recs = (appoData || []).filter(a => COUNTABLE.has(a.status) && (a.getDate || '').slice(0, 10) === ds);
      result.push({ date: ds.slice(5).replace('-', '/'), sales: recs.reduce((s, a) => s + (a.sales || 0), 0), count: recs.length, isToday: ds === todayStr });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [appoData, chartCustomFrom, chartCustomTo, todayStr]);

  // ── ② 個人売上ランキング ──────────────────────────────────────────────────
  const personFiltered = useMemo(() => (appoData || []).filter(a =>
    COUNTABLE.has(a.status) && filterBySimplePeriod(a.getDate, rankPersonPeriod, rankPersonFrom, rankPersonTo)
  ), [appoData, rankPersonPeriod, rankPersonFrom, rankPersonTo, todayStr, weekStartStr, monthStr]);

  const personRankData = useMemo(() => {
    const m = {};
    personFiltered.forEach(a => {
      const k = a.getter || '不明';
      if (!m[k]) m[k] = { total: 0, reward: 0, count: 0 };
      m[k].total += a.sales || 0; m[k].reward += a.reward || 0; m[k].count++;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }, [personFiltered]);

  // ── ③ チーム別売上ランキング ──────────────────────────────────────────────
  const teamFilteredData = useMemo(() => (appoData || []).filter(a =>
    COUNTABLE.has(a.status) && filterBySimplePeriod(a.getDate, rankTeamPeriod, rankTeamFrom, rankTeamTo)
  ), [appoData, rankTeamPeriod, rankTeamFrom, rankTeamTo, todayStr, weekStartStr, monthStr]);

  const teamRankData = useMemo(() => {
    const m = {};
    teamFilteredData.forEach(a => {
      const tn = teamMap[a.getter] || 'その他';
      if (!m[tn]) m[tn] = { total: 0, count: 0, members: new Set() };
      m[tn].total += a.sales || 0; m[tn].count++;
      if (a.getter) m[tn].members.add(a.getter);
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total).map(([tn, d]) => [tn, { ...d, memberCount: d.members.size }]);
  }, [teamFilteredData, teamMap]);

  // ── ④ クライアント別売上分析 ──────────────────────────────────────────────
  const clientFilteredData = useMemo(() => (appoData || []).filter(a =>
    COUNTABLE.has(a.status) && filterBySimplePeriod(a.getDate, rankClientPeriod, rankClientFrom, rankClientTo)
  ), [appoData, rankClientPeriod, rankClientFrom, rankClientTo, todayStr, weekStartStr, monthStr]);

  const clientData = useMemo(() => {
    const m = {};
    clientFilteredData.forEach(a => {
      const key = a.client || a.company || '不明';
      const name = a.client || a.company || key;
      if (!m[key]) m[key] = { name, total: 0, count: 0, lastDate: '', items: {} };
      m[key].total += a.sales || 0; m[key].count++;
      const d = a.getDate || '';
      if (d > m[key].lastDate) m[key].lastDate = d;
      const listKey = (a.getDate || '').slice(0, 7) || 'その他';
      if (!m[key].items[listKey]) m[key].items[listKey] = { total: 0, count: 0 };
      m[key].items[listKey].total += a.sales || 0; m[key].items[listKey].count++;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }, [clientFilteredData]);

  // ── 架電・売上ランキング統合セクション用フィルタ ─────────────────────────
  const callSalesFiltered = useMemo(() => (appoData || []).filter(a => {
    if (!COUNTABLE.has(a.status)) return false;
    const d = (a.getDate || '').slice(0, 10);
    if (callSalesPeriod === 'day') return d === todayStr;
    if (callSalesPeriod === 'week') return d >= weekStartStr && d <= todayStr;
    if (callSalesPeriod === 'month') return d >= monthStr + '-01' && d <= todayStr;
    if (callSalesPeriod === 'custom') {
      const dm = d.slice(0, 7);
      if (callSalesCustomFrom && dm < callSalesCustomFrom) return false;
      if (callSalesCustomTo && dm > callSalesCustomTo) return false;
      return true;
    }
    return false;
  }), [appoData, callSalesPeriod, callSalesCustomFrom, callSalesCustomTo, todayStr, weekStartStr, monthStr]);

  // ── 売上ランキング集計 (callSalesFiltered) ────────────────────────────────
  const salesByIndiv = useMemo(() => {
    const m = {};
    callSalesFiltered.forEach(a => {
      const k = a.getter || '不明';
      if (!m[k]) m[k] = { total: 0, reward: 0, count: 0 };
      m[k].total += a.sales || 0; m[k].reward += a.reward || 0; m[k].count++;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }, [callSalesFiltered]);

  const salesByTeam = useMemo(() => {
    const m = {};
    callSalesFiltered.forEach(a => {
      const tn = teamMap[a.getter] || 'その他';
      if (!m[tn]) m[tn] = { total: 0, count: 0, members: new Set() };
      m[tn].total += a.sales || 0; m[tn].count++;
      if (a.getter) m[tn].members.add(a.getter);
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total).map(([tn, d]) => [tn, { ...d, memberCount: d.members.size }]);
  }, [callSalesFiltered, teamMap]);

  // ── 架電ランキング集計 ────────────────────────────────────────────────────
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

  const salesIndivRank = salesByIndiv;
  const maxIndivSales  = salesIndivRank.length > 0 ? salesIndivRank[0][1].total : 1;
  const salesTeamRank  = salesByTeam;

  // ── 共通スタイル ──────────────────────────────────────────────────────────
  const tabBtn = (active, color) => ({
    padding: '5px 12px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Noto Sans JP'", border: '1px solid ' + (active ? color : C.border),
    background: active ? color : C.white, color: active ? C.white : C.textMid,
  });
  const monthSelectStyle = { padding: '3px 6px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, color: C.textDark, outline: 'none', fontFamily: "'Noto Sans JP'" };
  const dateInputStyle = { padding: '3px 6px', borderRadius: 4, border: '1px solid ' + C.border, fontSize: 11, color: C.textDark, outline: 'none', fontFamily: "'Noto Sans JP'" };
  const rankBadge = (rank) => ({
    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: rank <= 3 ? 12 : 9, fontWeight: 700, flexShrink: 0,
    background: rank === 1 ? C.gold : rank === 2 ? '#C0C0C0' : rank === 3 ? '#cd7f32' : C.offWhite,
    color: rank <= 3 ? C.white : C.textLight,
    border: rank <= 3 ? 'none' : '1px solid ' + C.borderLight,
  });
  const cardStyle = { background: C.white, borderRadius: 12, padding: '20px 22px', boxShadow: '0 2px 10px rgba(13,34,71,0.07)', borderTop: '3px solid ' + GOLD };

  // 月セレクタ付き期間セレクタ (salesPeriod / callPeriod 用)
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

  // 日付入力付きセクション独立フィルタ (日/週/月/期間指定)
  const simplePeriodSelector = (period, setPeriod, from, setFrom, to, setTo, accent) => (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
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

  const GrowthBadge = ({ pct }) => {
    if (pct === null) return <span style={{ fontSize: 10, color: C.textLight }}>前期比 —</span>;
    const up = pct >= 0;
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: up ? '#16a34a' : '#dc2626' }}>
        {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </span>
    );
  };

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

      {/* ========== セクション1: 売上サマリーカード ========== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
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
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>🔭 今月着地予測</div>
          {monthForecast !== null ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 900, color: GOLD, fontFamily: "'JetBrains Mono'" }}>
                {monthForecast >= 10000 ? <>{(monthForecast / 10000).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}>万円</span></> : fmtFull(monthForecast)}
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: C.textLight }}>
                {monthStr} / 当月{parseInt(todayStr.slice(8, 10))}日経過で予測
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.textLight, marginTop: 8 }}>データなし</div>
          )}
        </div>
      </div>

      {/* ========== セクション2: 売上推移グラフ ========== */}
      <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px', marginBottom: 20, boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📈</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>売上推移グラフ</span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['daily', '日次'], ['weekly', '週次'], ['monthly', '月次'], ['custom', '期間指定']].map(([k, l]) => (
              <button key={k} onClick={() => setChartTab(k)} style={tabBtn(chartTab === k, GOLD)}>{l}</button>
            ))}
            {chartTab === 'daily' && (
              <select value={chartMonthStr} onChange={e => setChartMonthStr(e.target.value)} style={{ ...monthSelectStyle, marginLeft: 8 }}>
                {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
              </select>
            )}
            {chartTab === 'custom' && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
                <input type='date' value={chartCustomFrom} onChange={e => setChartCustomFrom(e.target.value)} style={dateInputStyle} />
                <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
                <input type='date' value={chartCustomTo} onChange={e => setChartCustomTo(e.target.value)} style={dateInputStyle} />
              </div>
            )}
          </div>
        </div>

        {chartTab === 'daily' && (
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

        {chartTab === 'weekly' && (
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

        {chartTab === 'monthly' && (
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

        {chartTab === 'custom' && (
          customChartData.length === 0 ? (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 12 }}>
              開始日・終了日を選択してください
            </div>
          ) : (
            <ResponsiveContainer width='100%' height={280}>
              <BarChart data={customChartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
                <XAxis dataKey='date' tick={{ fontSize: 9, fill: '#888' }} interval='preserveStartEnd' />
                <YAxis tickFormatter={v => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v} tick={{ fontSize: 9, fill: '#888' }} />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey='sales' radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 8, fill: '#888', formatter: (v, _, props) => props?.count > 0 ? props.count + '件' : '' }}>
                  {customChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.isToday ? GOLD : NAVY} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        )}
      </div>

      {/* ========== セクション3: 個人・チーム別ランキング ========== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {/* ② 個人売上ランキング */}
        <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15 }}>🏅</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>個人売上ランキング</span>
            </div>
            {simplePeriodSelector(rankPersonPeriod, setRankPersonPeriod, rankPersonFrom, setRankPersonFrom, rankPersonTo, setRankPersonTo, GOLD)}
          </div>
          {personRankData.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
          ) : personRankData.map(([name, d], idx) => {
            const isMe = name === currentUser;
            const maxVal = personRankData[0]?.[1]?.total || 1;
            const barPct = Math.max(d.total / maxVal * 100, 2);
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

        {/* ③ チーム別売上ランキング */}
        <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15 }}>🏢</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>チーム別売上ランキング</span>
            </div>
            {simplePeriodSelector(rankTeamPeriod, setRankTeamPeriod, rankTeamFrom, setRankTeamFrom, rankTeamTo, setRankTeamTo, NAVY)}
          </div>
          {teamRankData.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
          ) : teamRankData.map(([tn, d], idx) => {
            const maxVal = teamRankData[0]?.[1]?.total || 1;
            const barPct = Math.max(d.total / maxVal * 100, 2);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🏛️</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>クライアント別売上分析</span>
            <span style={{ fontSize: 10, color: C.textLight }}>({clientData.length}社 / {clientFilteredData.length}件)</span>
          </div>
          {simplePeriodSelector(rankClientPeriod, setRankClientPeriod, rankClientFrom, setRankClientFrom, rankClientTo, setRankClientTo, NAVY)}
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
                    <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>月別内訳</div>
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

      {/* ========== 架電・売上ランキング（統合） ========== */}
      <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px', marginBottom: 20, boxShadow: '0 2px 10px rgba(13,34,71,0.07)' }}>
        {/* ヘッダー: タイトル＋期間フィルタ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>架電・売上ランキング</span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['day', '日'], ['week', '週'], ['month', '月'], ['custom', '期間指定']].map(([k, l]) => (
              <button key={k} onClick={() => setCallSalesPeriod(k)} style={tabBtn(callSalesPeriod === k, NAVY)}>{l}</button>
            ))}
            {callSalesPeriod === 'custom' && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <select value={callSalesCustomFrom} onChange={e => setCallSalesCustomFrom(e.target.value)} style={monthSelectStyle}>
                  <option value=''>開始月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
                <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
                <select value={callSalesCustomTo} onChange={e => setCallSalesCustomTo(e.target.value)} style={monthSelectStyle}>
                  <option value=''>終了月</option>
                  {AVAILABLE_MONTHS.map(m => <option key={m.yyyymm} value={m.yyyymm}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* メインタブ（架電/売上）- ゴールドアンダーライン */}
        <div style={{ display: 'flex', borderBottom: '2px solid #E5E5E5', marginBottom: 14 }}>
          {[['call', '📞 架電'], ['sales', '💰 売上']].map(([k, l]) => (
            <button key={k} onClick={() => setMainTab(k)} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'transparent', border: 'none', fontFamily: "'Noto Sans JP'", color: mainTab === k ? GOLD : C.textMid, borderBottom: mainTab === k ? '3px solid ' + GOLD : '3px solid transparent', marginBottom: -2 }}>{l}</button>
          ))}
        </div>

        {/* 架電タブ */}
        {mainTab === 'call' && (
          <>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 12 }}>
              {['team', 'individual', 'chart'].map(t => (
                <button key={t} onClick={() => setCallSubTab(t)} style={tabBtn(callSubTab === t, NAVY)}>
                  {t === 'team' ? 'チーム別' : t === 'individual' ? '個人別' : 'グラフ'}
                </button>
              ))}
              <span style={{ fontSize: 10, color: C.textLight, marginLeft: 8 }}>
                ({supaRecords.reduce((s, r) => s + Number(r.total), 0)}件)
              </span>
            </div>
            {callSubTab === 'team' && (
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '36px 1.5fr 0.8fr 0.8fr 0.8fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', borderBottom: '2px solid #E5E5E5' }}>
                  <span>#</span><span>チーム</span><span>架電件数</span><span>社長接続</span><span>アポ取得</span>
                </div>
                {callTeamRank.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
                  : callTeamRank.map(([tn, d], idx) => (
                    <div key={tn} style={{ display: 'grid', gridTemplateColumns: '36px 1.5fr 0.8fr 0.8fr 0.8fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2' }} onMouseEnter={e => e.currentTarget.style.background = '#EAF4FF'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={rankBadge(idx + 1)}>{idx === 0 ? '👑' : idx + 1}</span>
                      <span style={{ fontWeight: 700, color: NAVY }}>{tn}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{d.total}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{d.ceoConnect}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: GOLD }}>{d.appo}</span>
                    </div>
                  ))}
              </div>
            )}
            {callSubTab === 'individual' && (
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '36px 1.2fr 0.8fr 0.8fr 0.8fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', borderBottom: '2px solid #E5E5E5' }}>
                  <span>#</span><span>名前</span><span>架電件数</span><span>社長接続</span><span>アポ取得</span>
                </div>
                {callIndivRanked.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
                  : callIndivRanked.map((p, idx) => {
                    const isMe = p.name === currentUser;
                    return (
                      <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '36px 1.2fr 0.8fr 0.8fr 0.8fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2', background: isMe ? NAVY + '08' : 'transparent', borderLeft: isMe ? '3px solid ' + NAVY : '3px solid transparent' }}>
                        <span style={rankBadge(idx + 1)}>{idx === 0 ? '👑' : idx + 1}</span>
                        <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? NAVY : C.textDark }}>{p.name}{isMe ? ' ★' : ''}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{p.total}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>{p.ceoConnect}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 800, color: GOLD }}>{p.appo}</span>
                      </div>
                    );
                  })}
              </div>
            )}
            {callSubTab === 'chart' && (
              <div style={{ borderRadius: 8, border: '1px solid ' + C.borderLight, padding: '16px 14px' }}>
                {callIndivRanked.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
                  : callIndivRanked.map((p, idx) => {
                    const maxVal = callIndivRanked[0]?.total || 1;
                    return (
                      <div key={p.name} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 10, width: 18, textAlign: 'right', color: idx === 0 ? GOLD : C.textLight }}>{idx + 1}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: C.textDark, width: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ height: 18, borderRadius: 3, background: 'linear-gradient(90deg,' + NAVY + ',#1a3a6b)', width: Math.max(p.total / maxVal * 100, 2) + '%', transition: 'width 0.4s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
                              {p.total / maxVal > 0.2 && <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>{p.total}</span>}
                            </div>
                            <span style={{ fontSize: 9, color: C.textMid, whiteSpace: 'nowrap' }}>{p.total}件 / 接続{p.ceoConnect} / アポ{p.appo}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}

        {/* 売上タブ */}
        {mainTab === 'sales' && (
          <>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 12 }}>
              {['team', 'individual', 'chart'].map(t => (
                <button key={t} onClick={() => setSalesSubTab(t)} style={tabBtn(salesSubTab === t, GOLD)}>
                  {t === 'team' ? 'チーム別' : t === 'individual' ? '個人別' : 'グラフ'}
                </button>
              ))}
              <span style={{ fontSize: 10, color: C.textLight, marginLeft: 8 }}>
                ({callSalesFiltered.length}件)
              </span>
            </div>
            {salesSubTab === 'team' && (
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '36px 1.5fr 0.6fr 1fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', borderBottom: '2px solid #E5E5E5' }}>
                  <span>#</span><span>チーム</span><span>件数</span><span>売上</span>
                </div>
                {salesTeamRank.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
                  : salesTeamRank.map(([tn, d], idx) => (
                    <div key={tn} style={{ display: 'grid', gridTemplateColumns: '36px 1.5fr 0.6fr 1fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2' }} onMouseEnter={e => e.currentTarget.style.background = '#EAF4FF'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={rankBadge(idx + 1)}>{idx === 0 ? '👑' : idx + 1}</span>
                      <span style={{ fontWeight: 700, color: NAVY }}>{tn}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{d.count}</span>
                      <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 900, color: GOLD }}>{(d.total / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万円</span></span>
                    </div>
                  ))}
              </div>
            )}
            {salesSubTab === 'individual' && (
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E5E5' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '36px 1.2fr 0.6fr 0.8fr 0.8fr', padding: '8px 16px', background: '#F3F2F2', fontSize: 11, fontWeight: 700, color: '#706E6B', borderBottom: '2px solid #E5E5E5' }}>
                  <span>#</span><span>名前</span><span>件数</span><span>売上</span><span>報酬</span>
                </div>
                {salesIndivRank.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
                  : salesIndivRank.map(([name, d], idx) => {
                    const isMe = name === currentUser;
                    return (
                      <div key={name} style={{ display: 'grid', gridTemplateColumns: '36px 1.2fr 0.6fr 0.8fr 0.8fr', padding: '10px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #F3F2F2', background: isMe ? GOLD + '08' : 'transparent', borderLeft: isMe ? '3px solid ' + GOLD : '3px solid transparent' }}>
                        <span style={rankBadge(idx + 1)}>{idx === 0 ? '👑' : idx + 1}</span>
                        <span style={{ fontWeight: isMe ? 700 : 500, color: isMe ? NAVY : C.textDark }}>{name}{isMe ? ' ★' : ''}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 600 }}>{d.count}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12, fontWeight: 900, color: GOLD }}>{(d.total / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万</span></span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, fontWeight: 600, color: C.green }}>{(d.reward / 10000).toFixed(1)}<span style={{ fontSize: 9, fontWeight: 500 }}>万</span></span>
                      </div>
                    );
                  })}
              </div>
            )}
            {salesSubTab === 'chart' && (
              <div style={{ borderRadius: 8, border: '1px solid ' + C.borderLight, padding: '16px 14px' }}>
                {salesIndivRank.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>データなし</div>
                  : salesIndivRank.map(([name, d], idx) => {
                    const barMax = maxIndivSales > 0 ? maxIndivSales : 1;
                    return (
                      <div key={name} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 10, width: 18, textAlign: 'right', color: idx === 0 ? GOLD : C.textLight }}>{idx + 1}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: C.textDark, width: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ height: 18, borderRadius: 3, background: 'linear-gradient(90deg,' + GOLD + ',' + GOLD_LIGHT + ')', width: Math.max(d.total / barMax * 100, 2) + '%', transition: 'width 0.4s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
                              {d.total / barMax > 0.2 && <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>{d.count}件</span>}
                            </div>
                            <span style={{ fontSize: 9, color: GOLD, fontWeight: 700, whiteSpace: 'nowrap' }}>{(d.total / 10000).toFixed(1)}万</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
