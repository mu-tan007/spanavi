import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { C } from '../../constants/colors';
import { useCallStatuses } from '../../hooks/useCallStatuses';
import { formatCurrency } from '../../utils/formatters';
import { fetchCallRecordsByRange, fetchCallListsMeta } from '../../lib/supabaseWrite';
import { supabase } from '../../lib/supabase';
import { AVAILABLE_MONTHS } from '../../constants/availableMonths';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, Cell,
  PieChart, Pie,
} from 'recharts';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';
import PageHeader from '../common/PageHeader';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const GOLD_LIGHT = '#e0c97a';
const COUNTABLE = new Set(['面談済', '事前確認済', 'アポ取得']);
const fmt = (n) => formatCurrency(n);
const fmtFull = (n) => '¥' + (n || 0).toLocaleString();

const STATS_CLIENT_COLS = [
  { key: 'clientName', width: 280, align: 'left' },
  { key: 'count', width: 80, align: 'right' },
  { key: 'total', width: 150, align: 'right' },
  { key: 'avg', width: 130, align: 'right' },
];

const STATS_LIST_COLS = [
  { key: 'clientName', width: 260, align: 'left' },
  { key: 'name', width: 80, align: 'left' },
  { key: 'calls', width: 100, align: 'right' },
  { key: 'connect', width: 80, align: 'right' },
  { key: 'connectRate', width: 180, align: 'left' },
  { key: 'appo', width: 80, align: 'right' },
  { key: 'appoRate', width: 180, align: 'left' },
  { key: 'lastDate', width: 80, align: 'right' },
];

const STATS_RESCHED_COLS = [
  { key: 'name', width: 250, align: 'left' },
  { key: 'appoCount', width: 80, align: 'right' },
  { key: 'reschedCount', width: 80, align: 'right' },
  { key: 'reschedRate', width: 120, align: 'right' },
  { key: 'cancelCount', width: 80, align: 'right' },
  { key: 'cancelRate', width: 120, align: 'right' },
];

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

export default function StatsView({ callListData, currentUser, appoData, members, now: nowProp }) {
  const isMobile = useIsMobile();
  const { ceoConnectLabels } = useCallStatuses();

  // ── クライアント円グラフ選択 ──────────────────────────────────────────
  const [selectedClientPie, setSelectedClientPie] = useState(null);

  // ── KPI カード用（週次架電データ） ─────────────────────────────────────
  const [kpiCalls, setKpiCalls] = useState([]);
  const [kpiPrevCalls, setKpiPrevCalls] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);

  // ── クライアント円グラフホバー ─────────────────────────────────────────
  const [hoveredClientPie, setHoveredClientPie] = useState(null);

  // ── リスト別パフォーマンス ──────────────────────────────────────────────
  const [listPeriod, setListPeriod] = useState('week');
  const [listFrom, setListFrom] = useState('');
  const [listTo, setListTo] = useState('');
  const [listRecords, setListRecords] = useState([]);
  const [listMeta, setListMeta] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listSortKey, setListSortKey] = useState('calls');
  const [listSortDir, setListSortDir] = useState('desc');
  const [listFilter, setListFilter] = useState('all');

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

  // ── ⑥ クライアント別リスケ率・キャンセル率 ──────────────────────────────────
  const [clientRescanPeriod, setClientRescanPeriod] = useState('month');
  const [clientRescanFrom, setClientRescanFrom] = useState('');
  const [clientRescanTo, setClientRescanTo] = useState('');

  // ── カラムリサイズ・揃え ─────────────────────────────────────────────
  const clientCol = useColumnConfig('stats_client', STATS_CLIENT_COLS);
  const listCol = useColumnConfig('stats_list', STATS_LIST_COLS);
  const reschedCol = useColumnConfig('stats_resched', STATS_RESCHED_COLS);

  const now = nowProp ? new Date(nowProp) : new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const todayD = new Date(todayStr);
  const dayOfWeek = todayD.getDay();
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - ((dayOfWeek + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);


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

  const _jstStart = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
  const _jstEnd   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();

  // ── KPI カード: 今週・先週の架電データ ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setKpiLoading(true);
    const prevWeekStart = _offsetDays(weekStartStr, -7);
    const prevWeekEnd = _offsetDays(todayStr, -7);
    Promise.all([
      fetchCallRecordsByRange(_jstStart(weekStartStr), _jstEnd(todayStr)),
      fetchCallRecordsByRange(_jstStart(prevWeekStart), _jstEnd(prevWeekEnd)),
    ])
      .then(([cur, prev]) => { if (!cancelled) { setKpiCalls(cur.data || []); setKpiPrevCalls(prev.data || []); } })
      .catch(err => console.error('[StatsView] kpiFetch:', err))
      .finally(() => { if (!cancelled) setKpiLoading(false); });
    return () => { cancelled = true; };
  }, [weekStartStr, todayStr]);

  // ── リスト別パフォーマンス: メタデータ（初回のみ） ───────────────────────
  useEffect(() => {
    fetchCallListsMeta()
      .then(({ data }) => setListMeta(data || []))
      .catch(err => console.error('[StatsView] listMetaFetch:', err));
  }, []);

  // ── リスト別パフォーマンス: 架電レコード ────────────────────────────────
  useEffect(() => {
    const range = getActivityDateRange(listPeriod, listFrom, listTo, todayStr, weekStartStr, monthStr);
    if (!range) return;
    let cancelled = false;
    setListLoading(true);
    fetchCallRecordsByRange(_jstStart(range.from), _jstEnd(range.to))
      .then(({ data }) => { if (!cancelled) setListRecords(data || []); })
      .catch(err => console.error('[StatsView] listFetch:', err))
      .finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [listPeriod, listFrom, listTo, todayStr, weekStartStr, monthStr]);

  const teamMap = useMemo(() => {
    const m = {};
    members.forEach(mb => { m[mb.name] = mb.team ? mb.team + 'チーム' : '営業統括'; });
    return m;
  }, [members]);

  // ── KPI カード用 ─────────────────────────────────────────────────────────
  const dayOfMonth = parseInt(todayStr.slice(8), 10);
  const monthStart = monthStr + '-01';
  const [_kpiY, _kpiM] = monthStr.split('-').map(Number);
  const _prevMonthD = new Date(_kpiY, _kpiM - 2, 1);
  const prevMonthStr = _prevMonthD.getFullYear() + '-' + String(_prevMonthD.getMonth() + 1).padStart(2, '0');
  const prevMonthMaxDays = new Date(_prevMonthD.getFullYear(), _prevMonthD.getMonth() + 1, 0).getDate();
  const prevMonthEndStr = prevMonthStr + '-' + String(Math.min(dayOfMonth, prevMonthMaxDays)).padStart(2, '0');

  const monthAppoFiltered = useMemo(() => (appoData || []).filter(a => {
    if (!COUNTABLE.has(a.status)) return false;
    const d = (a.getDate || '').slice(0, 10);
    return d >= monthStart && d <= todayStr;
  }), [appoData, monthStart, todayStr]);

  const prevMonthAppoFiltered = useMemo(() => (appoData || []).filter(a => {
    if (!COUNTABLE.has(a.status)) return false;
    const d = (a.getDate || '').slice(0, 10);
    return d >= prevMonthStr + '-01' && d <= prevMonthEndStr;
  }), [appoData, prevMonthStr, prevMonthEndStr]);

  const kpiMonthSales = useMemo(() => monthAppoFiltered.reduce((s, a) => s + (a.sales || 0), 0), [monthAppoFiltered]);
  const kpiPrevMonthSales = useMemo(() => prevMonthAppoFiltered.reduce((s, a) => s + (a.sales || 0), 0), [prevMonthAppoFiltered]);
  // アポ件数は call_records.status='アポ獲得' ベース（Performance/Dashboard と統一）
  const [kpiMonthAppo, setKpiMonthAppo] = useState(0);
  const [kpiPrevMonthAppo, setKpiPrevMonthAppo] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const monthEnd = monthStr + '-' + String(new Date(_kpiY, _kpiM, 0).getDate()).padStart(2, '0');
    const prevMonthEnd = prevMonthStr + '-' + String(prevMonthMaxDays).padStart(2, '0');
    Promise.all([
      supabase.rpc('get_call_ranking', { from_iso: _jstStart(monthStart), to_iso: _jstEnd(monthEnd) }),
      supabase.rpc('get_call_ranking', { from_iso: _jstStart(prevMonthStr + '-01'), to_iso: _jstEnd(prevMonthEnd) }),
    ]).then(([cur, prev]) => {
      if (cancelled) return;
      setKpiMonthAppo((cur.data || []).reduce((s, r) => s + Number(r.appo || 0), 0));
      setKpiPrevMonthAppo((prev.data || []).reduce((s, r) => s + Number(r.appo || 0), 0));
    }).catch(err => console.error('[StatsView] monthAppoFetch:', err));
    return () => { cancelled = true; };
  }, [monthStart, monthStr, prevMonthStr, _kpiY, _kpiM, prevMonthMaxDays]);
  // リスケ率/キャンセル率の denominator は従来通り appointments ベース
  const kpiMonthAppoActive = monthAppoFiltered.length;
  const kpiWeekCalls = kpiCalls.length;
  const kpiPrevWeekCalls = kpiPrevCalls.length;
  const kpiWeekAppo = useMemo(() => kpiCalls.filter(r => r.status === 'アポ獲得').length, [kpiCalls]);
  const kpiPrevWeekAppo = useMemo(() => kpiPrevCalls.filter(r => r.status === 'アポ獲得').length, [kpiPrevCalls]);
  const kpiWeekAppoRate = kpiWeekCalls > 0 ? kpiWeekAppo / kpiWeekCalls * 100 : 0;
  const kpiPrevWeekAppoRate = kpiPrevWeekCalls > 0 ? kpiPrevWeekAppo / kpiPrevWeekCalls * 100 : 0;

  const kpiMonthReschedule = useMemo(() => (appoData || []).filter(a => {
    const d = (a.getDate || '').slice(0, 10);
    return a.status === 'リスケ中' && d >= monthStart && d <= todayStr;
  }).length, [appoData, monthStart, todayStr]);
  const kpiMonthCancel = useMemo(() => (appoData || []).filter(a => {
    const d = (a.getDate || '').slice(0, 10);
    return a.status === 'キャンセル' && d >= monthStart && d <= todayStr;
  }).length, [appoData, monthStart, todayStr]);
  const kpiMonthAppoTotal = kpiMonthAppoActive + kpiMonthReschedule + kpiMonthCancel;
  const kpiRescheduleRate = kpiMonthAppoTotal > 0 ? kpiMonthReschedule / kpiMonthAppoTotal * 100 : 0;
  const kpiCancelRate = kpiMonthAppoTotal > 0 ? kpiMonthCancel / kpiMonthAppoTotal * 100 : 0;

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

  // ── ⑥ クライアント別リスケ率・キャンセル率データ ────────────────────────────
  const ALL_APPO_STATUSES = new Set([...COUNTABLE, 'リスケ中', 'キャンセル']);
  const clientReschedData = useMemo(() => {
    const m = {};
    (appoData || []).filter(a =>
      ALL_APPO_STATUSES.has(a.status) && filterBySimplePeriod(a.getDate, clientRescanPeriod, clientRescanFrom, clientRescanTo)
    ).forEach(a => {
      const key = a.client || '不明';
      if (!m[key]) m[key] = { name: key, appo: 0, reschedule: 0, cancel: 0 };
      if (COUNTABLE.has(a.status)) m[key].appo++;
      else if (a.status === 'リスケ中') m[key].reschedule++;
      else if (a.status === 'キャンセル') m[key].cancel++;
    });
    return Object.values(m).map(d => ({
      ...d,
      total: d.appo + d.reschedule + d.cancel,
      rescheduleRate: (d.appo + d.reschedule + d.cancel) > 0 ? d.reschedule / (d.appo + d.reschedule + d.cancel) * 100 : 0,
      cancelRate: (d.appo + d.reschedule + d.cancel) > 0 ? d.cancel / (d.appo + d.reschedule + d.cancel) * 100 : 0,
    })).filter(d => d.total > 0).sort((a, b) => b.total - a.total);
  }, [appoData, clientRescanPeriod, clientRescanFrom, clientRescanTo, todayStr, weekStartStr, monthStr]);

  // ── リスト別パフォーマンス ───────────────────────────────────────────────
  const listMetaMap = useMemo(() => {
    const m = {};
    listMeta.forEach(l => { m[l.id] = l; });
    return m;
  }, [listMeta]);

  const listTableData = useMemo(() => {
    const m = {};
    listRecords.forEach(r => {
      const id = r.list_id;
      if (!id) return;
      if (!m[id]) m[id] = { calls: 0, connect: 0, appo: 0, lastDate: '' };
      m[id].calls++;
      if (ceoConnectLabels.has(r.status)) m[id].connect++;
      if (r.status === 'アポ獲得') m[id].appo++;
      const jd = new Date(r.called_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
      if (jd > m[id].lastDate) m[id].lastDate = jd;
    });
    return Object.entries(m).map(([listId, d]) => {
      const meta = listMetaMap[listId] || {};
      return {
        listId,
        name: meta.name || listId,
        clientName: meta.clients?.name || '不明',
        isArchived: !!meta.is_archived,
        ...d,
        connectRate: d.calls > 0 ? d.connect / d.calls * 100 : 0,
        appoRate: d.calls > 0 ? d.appo / d.calls * 100 : 0,
      };
    });
  }, [listRecords, listMetaMap, ceoConnectLabels]);

  const listFiltered = useMemo(() => {
    let rows = listTableData;
    if (listFilter === 'active') rows = rows.filter(r => !r.isArchived);
    if (listFilter === 'archived') rows = rows.filter(r => r.isArchived);
    const dir = listSortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[listSortKey] ?? 0, bv = b[listSortKey] ?? 0;
      if (typeof av === 'string') return av.localeCompare(bv, 'ja') * dir;
      return (av - bv) * dir;
    });
  }, [listTableData, listFilter, listSortKey, listSortDir]);

  const listTop3Ids = useMemo(() =>
    new Set([...listTableData].sort((a, b) => b.calls - a.calls).slice(0, 3).map(r => r.listId))
  , [listTableData]);

  // ── 共通スタイル ──────────────────────────────────────────────────────────
  const tabBtn = (active) => ({
    padding: '6px 12px', fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer',
    background: 'transparent', border: 'none', borderBottom: '2px solid ' + (active ? NAVY : 'transparent'),
    color: active ? NAVY : '#9CA3AF', borderRadius: 0, fontFamily: "'Noto Sans JP'",
    transition: 'all 0.15s',
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
  const cardStyle = { background: C.white, borderRadius: 4, padding: '16px 18px', border: '1px solid #E5E7EB' };

  // 日付入力付きセクション独立フィルタ (日/週/月/期間指定)
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
      <div style={{ background: NAVY, borderRadius: 4, padding: '8px 12px', color: '#fff', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div>売上: {fmtFull(payload[0]?.value)}</div>
        {payload[0]?.payload?.count != null && <div>アポ数: {payload[0].payload.count}件</div>}
      </div>
    );
  };

  const CustomLineTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: NAVY, borderRadius: 4, padding: '8px 12px', color: '#fff', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div>売上: {fmtFull(payload[0]?.value)}</div>
        {payload[0]?.payload?.count != null && <div>アポ数: {payload[0].payload.count}件</div>}
      </div>
    );
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>

      <PageHeader
        eyebrow="Sourcing · Analytics"
        title="Analytics"
        description="売上・架電・ランキングの統合分析ダッシュボード"
        style={{ marginBottom: isMobile ? 16 : 24 }}
      />

      {/* ========== セクション1: KPIサマリーカード ========== */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 14, marginBottom: 20 }}>
        {/* Card 1: 今月累計売上 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3 }}>今月（{parseInt(monthStr.slice(5))}月1日〜{dayOfMonth}日）</div>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>今月累計売上</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'", letterSpacing: '-0.5px' }}>
            {formatCurrency(kpiMonthSales)}
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <GrowthBadge pct={kpiPrevMonthSales > 0 ? (kpiMonthSales - kpiPrevMonthSales) / kpiPrevMonthSales * 100 : null} />
            {kpiPrevMonthSales > 0 && <span style={{ fontSize: 10, color: C.textLight }}>前月同期: {fmt(kpiPrevMonthSales)}</span>}
          </div>
        </div>
        {/* Card 2: 今月アポ取得数 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3 }}>今月（{parseInt(monthStr.slice(5))}月1日〜{dayOfMonth}日）</div>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>今月アポ取得数</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'" }}>
            {kpiMonthAppo}<span style={{ fontSize: 13, fontWeight: 600 }}>件</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <GrowthBadge pct={kpiPrevMonthAppo > 0 ? (kpiMonthAppo - kpiPrevMonthAppo) / kpiPrevMonthAppo * 100 : null} />
            {kpiPrevMonthAppo > 0 && <span style={{ fontSize: 10, color: C.textLight }}>前月同期: {kpiPrevMonthAppo}件</span>}
          </div>
        </div>
        {/* Card 3: 今週の架電数 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3 }}>今週（{weekStartStr.slice(5).replace('-', '/')}〜{todayStr.slice(5).replace('-', '/')}）</div>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>今週の架電数{kpiLoading && <span style={{ fontSize: 9, color: C.textLight, marginLeft: 4 }}>…</span>}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'" }}>
            {kpiWeekCalls}<span style={{ fontSize: 13, fontWeight: 600 }}>件</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <GrowthBadge pct={kpiPrevWeekCalls > 0 ? (kpiWeekCalls - kpiPrevWeekCalls) / kpiPrevWeekCalls * 100 : null} />
            {kpiPrevWeekCalls > 0 && <span style={{ fontSize: 10, color: C.textLight }}>先週同期: {kpiPrevWeekCalls}件</span>}
          </div>
        </div>
        {/* Card 4: 今週のアポ率 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3 }}>今週（{weekStartStr.slice(5).replace('-', '/')}〜{todayStr.slice(5).replace('-', '/')}）</div>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>今週のアポ率{kpiLoading && <span style={{ fontSize: 9, color: C.textLight, marginLeft: 4 }}>…</span>}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'" }}>
            {kpiWeekAppoRate.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}>%</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            {kpiPrevWeekAppoRate > 0 ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: kpiWeekAppoRate >= kpiPrevWeekAppoRate ? '#16a34a' : '#dc2626' }}>
                {kpiWeekAppoRate >= kpiPrevWeekAppoRate ? '▲' : '▼'} {Math.abs(kpiWeekAppoRate - kpiPrevWeekAppoRate).toFixed(1)}pt
              </span>
            ) : <span style={{ fontSize: 10, color: C.textLight }}>先週比 —</span>}
            {kpiPrevWeekAppoRate > 0 && <span style={{ fontSize: 10, color: C.textLight }}>先週: {kpiPrevWeekAppoRate.toFixed(1)}%</span>}
          </div>
        </div>
      </div>

      {/* Card 5+6: リスケ率・キャンセル率 */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 8 : 14, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3 }}>今月（{parseInt(monthStr.slice(5))}月1日〜{dayOfMonth}日）</div>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>リスケ率</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'" }}>
            {kpiRescheduleRate.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}>%</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: C.textLight }}>
            リスケ {kpiMonthReschedule}件 / アポ合計 {kpiMonthAppoTotal}件
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3 }}>今月（{parseInt(monthStr.slice(5))}月1日〜{dayOfMonth}日）</div>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 6 }}>キャンセル率</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#EF4444', fontFamily: "'JetBrains Mono'" }}>
            {kpiCancelRate.toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}>%</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: C.textLight }}>
            キャンセル {kpiMonthCancel}件 / アポ合計 {kpiMonthAppoTotal}件
          </div>
        </div>
      </div>

      {/* ========== セクション2: 売上推移グラフ ========== */}
      <div style={{ background: C.white, borderRadius: 4, padding: isMobile ? '12px 10px' : '18px 20px', marginBottom: 20, border: '1px solid #E5E7EB', overflowX: isMobile ? 'auto' : 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>売上推移グラフ</span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #E5E5E5' }}>
            {[['daily', '日次'], ['weekly', '週次'], ['monthly', '月次'], ['custom', '期間指定']].map(([k, l]) => (
              <button key={k} onClick={() => setChartTab(k)} style={tabBtn(chartTab === k)}>{l}</button>
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
                  <Cell key={i} fill={entry.isToday ? '#1E40AF' : NAVY} />
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
              <Area type='monotone' dataKey='sales' stroke={NAVY} strokeWidth={2} fill='url(#weekGrad)' dot={{ r: 4, fill: NAVY }} activeDot={{ r: 6, fill: '#1E40AF' }} />
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
                    <Cell key={i} fill={entry.isToday ? '#1E40AF' : NAVY} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        )}
      </div>

      {/* ========== セクション3: 個人・チーム別ランキング ========== */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 8 : 14, marginBottom: 20 }}>
        {/* ② 個人売上ランキング */}
        <div style={{ background: C.white, borderRadius: 4, padding: '18px 20px', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>個人売上ランキング</span>
            </div>
            {simplePeriodSelector(rankPersonPeriod, setRankPersonPeriod, rankPersonFrom, setRankPersonFrom, rankPersonTo, setRankPersonTo)}
          </div>
          {personRankData.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
          ) : personRankData.map(([name, d], idx) => {
            const isMe = name === currentUser;
            const maxVal = personRankData[0]?.[1]?.total || 1;
            const barPct = Math.max(d.total / maxVal * 100, 2);
            const medalBg = idx === 0 ? 'linear-gradient(135deg,#C8A84B,#e0c97a)' : idx === 1 ? 'linear-gradient(135deg,#b0b0b0,#d8d8d8)' : idx === 2 ? 'linear-gradient(135deg,#cd7f32,#e8a060)' : C.offWhite;
            return (
              <div key={name} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: isMe ? NAVY + '08' : 'transparent', borderLeft: isMe ? '3px solid #1E40AF' : '3px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: idx < 3 ? 11 : 9, fontWeight: 700, background: medalBg, color: idx < 3 ? '#fff' : C.textLight, flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isMe ? 700 : 500, color: isMe ? NAVY : C.textDark }}>{name}{isMe ? ' ★' : ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "'JetBrains Mono'", color: '#111827' }}>{fmt(d.total)}</span>
                  <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>{d.count}件</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: C.offWhite, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: idx === 0 ? 'linear-gradient(90deg,' + NAVY + ',#1a3a6b)' : 'linear-gradient(90deg,#9CA3AF,#d1d5db)', width: barPct + '%', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ③ チーム別売上ランキング */}
        <div style={{ background: C.white, borderRadius: 4, padding: '18px 20px', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>チーム別売上ランキング</span>
            </div>
            {simplePeriodSelector(rankTeamPeriod, setRankTeamPeriod, rankTeamFrom, setRankTeamFrom, rankTeamTo, setRankTeamTo, NAVY)}
          </div>
          {teamRankData.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
          ) : teamRankData.map(([tn, d], idx) => {
            const maxVal = teamRankData[0]?.[1]?.total || 1;
            const barPct = Math.max(d.total / maxVal * 100, 2);
            const medalBg = idx === 0 ? 'linear-gradient(135deg,#C8A84B,#e0c97a)' : idx === 1 ? 'linear-gradient(135deg,#b0b0b0,#d8d8d8)' : idx === 2 ? 'linear-gradient(135deg,#cd7f32,#e8a060)' : C.offWhite;
            return (
              <div key={tn} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: idx < 3 ? 11 : 9, fontWeight: 700, background: medalBg, color: idx < 3 ? '#fff' : C.textLight, flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: NAVY }}>{tn}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "'JetBrains Mono'", color: '#111827' }}>{fmt(d.total)}</span>
                  <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'JetBrains Mono'" }}>{d.count}件 / {d.memberCount}人</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: C.offWhite, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: idx === 0 ? 'linear-gradient(90deg,' + NAVY + ',#1a3a6b)' : 'linear-gradient(90deg,#9CA3AF,#d1d5db)', width: barPct + '%', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========== セクション4: クライアント別売上分析 ========== */}
      {(() => {
        const CLIENT_PIE_COLORS = ['#0D2247','#1E3A6E','#1E40AF','#2563EB','#3B82F6','#60A5FA','#93C5FD','#BFDBFE','#DBEAFE'];
        const pieData = clientData.map(([key, d]) => ({ name: d.name, value: d.total, key }));
        const totalPie = pieData.reduce((s, d) => s + d.value, 0);
        const ClientPieTooltip = ({ active, payload }) => {
          if (!active || !payload?.length) return null;
          return (
            <div style={{ background: NAVY, borderRadius: 4, padding: '7px 12px', color: '#fff', fontSize: 11 }}>
              <div style={{ fontWeight: 700 }}>{payload[0].name}</div>
              <div>{fmtFull(payload[0].value)}</div>
              <div style={{ color: '#93C5FD' }}>{totalPie > 0 ? (payload[0].value / totalPie * 100).toFixed(1) : 0}%</div>
            </div>
          );
        };
        return (
          <div style={{ background: C.white, borderRadius: 4, padding: '18px 20px', marginBottom: 20, border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>クライアント別売上分析</span>
                <span style={{ fontSize: 10, color: C.textLight }}>({clientData.length}社 / {clientFilteredData.length}件)</span>
              </div>
              {simplePeriodSelector(rankClientPeriod, setRankClientPeriod, rankClientFrom, setRankClientFrom, rankClientTo, setRankClientTo, NAVY)}
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              {/* テーブル */}
              <div style={{ flex: '1.5', minWidth: 0, borderRadius: 4, overflowX: 'auto', overflowY: 'hidden', border: '1px solid #E5E7EB' }}>
                <div style={{ minWidth: clientCol.contentMinWidth }}>
                <div style={{ display: 'grid', gridTemplateColumns: clientCol.gridTemplateColumns, padding: '8px 16px', background: '#0D2247', fontSize: 11, fontWeight: 600, color: '#ffffff', borderBottom: '1px solid #0D2247' }}>
                  {[['クライアント名',0],['アポ数',1],['売上合計',2],['平均単価',3]].map(([label, ci]) => (
                    <span key={ci} style={{ position: 'relative', textAlign: clientCol.columns[ci].align }} onContextMenu={e => clientCol.onHeaderContextMenu(e, ci)}>
                      {label}
                      <ColumnResizeHandle colIndex={ci} onResizeStart={clientCol.onResizeStart} />
                    </span>
                  ))}
                </div>
                {clientData.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
                ) : clientData.map(([key, d], idx) => {
                  const isExpanded = expandedClient === key;
                  const isPieSelected = selectedClientPie === key;
                  const isHovered = hoveredClientPie === key;
                  const isHighlighted = isPieSelected || isHovered;
                  const avg = d.count > 0 ? Math.round(d.total / d.count) : 0;
                  return (
                    <React.Fragment key={key}>
                      <div
                        onClick={() => { setExpandedClient(isExpanded ? null : key); setSelectedClientPie(isPieSelected ? null : key); }}
                        style={{ display: 'grid', gridTemplateColumns: clientCol.gridTemplateColumns, padding: '8px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #E5E7EB', cursor: 'pointer', background: isHighlighted ? '#EFF6FF' : isExpanded ? NAVY + '06' : idx % 2 === 0 ? 'transparent' : '#F8F9FA', transition: 'background 0.15s', borderLeft: `4px solid ${CLIENT_PIE_COLORS[idx % CLIENT_PIE_COLORS.length]}`, opacity: (selectedClientPie || hoveredClientPie) && !isHighlighted ? 0.55 : 1 }}
                        onMouseEnter={e => { setHoveredClientPie(key); if (!isHighlighted) e.currentTarget.style.background = '#EAF4FF'; }}
                        onMouseLeave={e => { setHoveredClientPie(null); e.currentTarget.style.background = isHighlighted ? '#EFF6FF' : isExpanded ? NAVY + '06' : idx % 2 === 0 ? 'transparent' : '#F8F9FA'; }}
                      >
                        <span style={{ fontWeight: 600, color: NAVY, display: 'flex', alignItems: 'center', gap: 6, textAlign: clientCol.columns[0].align }}>
                          <span style={{ fontSize: 9, color: C.textLight, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
                          {d.name}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, textAlign: clientCol.columns[1].align }}>{d.count}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 13, fontWeight: 900, color: '#111827', textAlign: clientCol.columns[2].align }}>{fmt(d.total)}</span>
                        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, color: C.textDark, textAlign: clientCol.columns[3].align }}>{fmt(avg)}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ borderBottom: '1px solid #E5E5E5', background: NAVY + '04', padding: '8px 24px 12px' }}>
                          <div style={{ fontSize: 10, color: C.textLight, marginBottom: 6, fontWeight: 600 }}>月別内訳</div>
                          {Object.entries(d.items).map(([listId, ld]) => (
                            <div key={listId} style={{ display: 'flex', gap: 16, padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 11 }}>
                              <span style={{ flex: 1, color: C.textDark }}>{listId}</span>
                              <span style={{ fontFamily: "'JetBrains Mono'", color: C.textMid }}>{ld.count}件</span>
                              <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: '#111827' }}>{fmt(ld.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                </div>
              </div>
              {/* 円グラフ */}
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 6 }}>売上構成比</div>
                {pieData.length === 0 ? (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
                ) : (
                  <ResponsiveContainer width='100%' height={380}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx='50%' cy='50%'
                        outerRadius={180}
                        dataKey='value'
                        labelLine={false}
                        onClick={d => setSelectedClientPie(selectedClientPie === d.key ? null : d.key)}
                      >
                        {pieData.map(({ key }, idx) => (
                          <Cell
                            key={key}
                            fill={CLIENT_PIE_COLORS[idx % CLIENT_PIE_COLORS.length]}
                            stroke={selectedClientPie === key || hoveredClientPie === key ? '#1E40AF' : 'none'}
                            strokeWidth={selectedClientPie === key || hoveredClientPie === key ? 3 : 0}
                            opacity={(selectedClientPie || hoveredClientPie) && selectedClientPie !== key && hoveredClientPie !== key ? 0.45 : 1}
                            onMouseEnter={() => setHoveredClientPie(key)}
                            onMouseLeave={() => setHoveredClientPie(null)}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ClientPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========== セクション5: リスト別パフォーマンス ========== */}
      {(() => {
        const rateColor = (r) => r < 5 ? '#ef4444' : r < 15 ? '#f59e0b' : '#10b981';
        const RateBar = ({ rate }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 11, width: 44, textAlign: 'right', flexShrink: 0 }}>{rate.toFixed(1)}%</span>
            <div style={{ width: 100, height: 4, borderRadius: 2, background: '#F0F0F0', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', background: rateColor(rate), width: Math.min(rate * 5, 100) + '%', borderRadius: 2 }} />
            </div>
          </div>
        );
        const SortHdr = ({ label, sk, colIndex }) => (
          <span
            onClick={() => { if (listSortKey === sk) setListSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setListSortKey(sk); setListSortDir('desc'); } }}
            onContextMenu={e => listCol.onHeaderContextMenu(e, colIndex)}
            style={{ position: 'relative', cursor: 'pointer', userSelect: 'none', color: listSortKey === sk ? '#ffffff' : 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', textAlign: listCol.columns[colIndex].align }}>
            {label}{listSortKey === sk ? (listSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
            <ColumnResizeHandle colIndex={colIndex} onResizeStart={listCol.onResizeStart} />
          </span>
        );
        return (
          <div style={{ background: C.white, borderRadius: 4, padding: '18px 20px', marginBottom: 20, border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>リスト別パフォーマンス</span>
                <span style={{ fontSize: 10, color: C.textLight }}>{listFiltered.length}件のリスト</span>
                {listLoading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
              </div>
              {simplePeriodSelector(listPeriod, setListPeriod, listFrom, setListFrom, listTo, setListTo, NAVY)}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['all', '全て表示'], ['active', 'アクティブのみ'], ['archived', 'アーカイブのみ']].map(([k, l]) => (
                <button key={k} onClick={() => setListFilter(k)} style={listFilter === k ? { background: '#0D2247', color: '#FFFFFF', border: '1px solid #0D2247', borderRadius: 4, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'Noto Sans JP'" } : { background: '#FFFFFF', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 4, padding: '5px 12px', fontSize: 11, fontWeight: 400, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>{l}</button>
              ))}
            </div>
            <div style={{ borderRadius: 4, border: '1px solid #E5E7EB', overflowX: 'auto', overflowY: 'hidden' }}>
              <div style={{ minWidth: listCol.contentMinWidth }}>
              <div style={{ display: 'grid', gridTemplateColumns: listCol.gridTemplateColumns, padding: '8px 16px', background: '#0D2247', fontSize: 11, fontWeight: 600, color: '#ffffff', borderBottom: '1px solid #0D2247', minWidth: 1170 }}>
                <SortHdr label='クライアント' sk='clientName' colIndex={0} />
                <SortHdr label='業種' sk='name' colIndex={1} />
                <SortHdr label='架電数' sk='calls' colIndex={2} />
                <SortHdr label='接続数' sk='connect' colIndex={3} />
                <SortHdr label='接続率' sk='connectRate' colIndex={4} />
                <SortHdr label='アポ数' sk='appo' colIndex={5} />
                <SortHdr label='アポ率' sk='appoRate' colIndex={6} />
                <SortHdr label='最終架電日' sk='lastDate' colIndex={7} />
              </div>
              {listFiltered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>
                  {listLoading ? '読込中...' : '— No records —'}
                </div>
              ) : listFiltered.map((row, idx) => {
                const isTop3 = listTop3Ids.has(row.listId);
                return (
                  <div key={row.listId} style={{ display: 'grid', gridTemplateColumns: listCol.gridTemplateColumns, padding: '8px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #E5E7EB', background: isTop3 ? NAVY + '0F' : idx % 2 === 0 ? 'transparent' : '#F8F9FA', borderLeft: isTop3 ? '3px solid ' + NAVY : '3px solid transparent', minWidth: 1170 }}>
                    <span style={{ fontSize: 11, color: C.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: listCol.columns[0].align }}>{row.clientName}</span>
                    <span style={{ fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, textAlign: listCol.columns[1].align }}>
                      {row.name.includes(' - ') ? row.name.split(' - ').slice(1).join(' - ') : row.name}
                      {row.isArchived && <span style={{ fontSize: 9, background: '#F3F2F2', borderRadius: 3, padding: '1px 4px', color: C.textLight, flexShrink: 0 }}>Arc</span>}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: NAVY, textAlign: listCol.columns[2].align }}>{row.calls}</span>
                    <span style={{ fontFamily: "'JetBrains Mono'", textAlign: listCol.columns[3].align }}>{row.connect}</span>
                    <RateBar rate={row.connectRate} />
                    <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: '#374151', textAlign: listCol.columns[5].align }}>{row.appo}</span>
                    <RateBar rate={row.appoRate} />
                    <span style={{ fontSize: 11, color: C.textMid, textAlign: listCol.columns[7].align }}>{row.lastDate || '—'}</span>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        );
      })()}
      {/* ========== セクション6: クライアント別リスケ率・キャンセル率 ========== */}
      <div style={{ background: C.white, borderRadius: 4, padding: isMobile ? '12px 10px' : '18px 20px', marginBottom: 20, border: '1px solid #E5E7EB', overflowX: isMobile ? 'auto' : 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>クライアント別リスケ率・キャンセル率</span>
            <span style={{ fontSize: 10, color: C.textLight }}>{clientReschedData.length}社</span>
          </div>
          {simplePeriodSelector(clientRescanPeriod, setClientRescanPeriod, clientRescanFrom, setClientRescanFrom, clientRescanTo, setClientRescanTo, NAVY)}
        </div>
        <div style={{ borderRadius: 4, overflowX: 'auto', overflowY: 'hidden', border: '1px solid #E5E7EB' }}>
          <div style={{ minWidth: reschedCol.contentMinWidth }}>
          <div style={{ display: 'grid', gridTemplateColumns: reschedCol.gridTemplateColumns, padding: '8px 16px', background: '#0D2247', fontSize: 11, fontWeight: 600, color: '#ffffff', borderBottom: '1px solid #0D2247' }}>
            {[['クライアント名',0],['アポ数',1],['リスケ数',2],['リスケ率',3],['キャンセル数',4],['キャンセル率',5]].map(([label, ci]) => (
              <span key={ci} style={{ position: 'relative', textAlign: reschedCol.columns[ci].align }} onContextMenu={e => reschedCol.onHeaderContextMenu(e, ci)}>
                {label}
                <ColumnResizeHandle colIndex={ci} onResizeStart={reschedCol.onResizeStart} />
              </span>
            ))}
          </div>
          {clientReschedData.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textLight, fontSize: 12 }}>— No records —</div>
          ) : clientReschedData.map((d, idx) => (
            <div key={d.name} style={{ display: 'grid', gridTemplateColumns: reschedCol.gridTemplateColumns, padding: '8px 16px', fontSize: 12, alignItems: 'center', borderBottom: '1px solid #E5E7EB', background: idx % 2 === 0 ? 'transparent' : '#F8F9FA' }}>
              <span style={{ fontWeight: 600, color: NAVY, textAlign: reschedCol.columns[0].align }}>{d.name}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", textAlign: reschedCol.columns[1].align }}>{d.appo}</span>
              <span style={{ fontFamily: "'JetBrains Mono'", textAlign: reschedCol.columns[2].align, color: d.reschedule > 0 ? '#F59E0B' : C.textLight }}>{d.reschedule}</span>
              <span style={{ textAlign: reschedCol.columns[3].align }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: d.rescheduleRate >= 20 ? '#DC2626' : d.rescheduleRate >= 10 ? '#F59E0B' : '#374151' }}>
                  {d.rescheduleRate.toFixed(1)}%
                </span>
              </span>
              <span style={{ fontFamily: "'JetBrains Mono'", textAlign: reschedCol.columns[4].align, color: d.cancel > 0 ? '#EF4444' : C.textLight }}>{d.cancel}</span>
              <span style={{ textAlign: reschedCol.columns[5].align }}>
                <span style={{ fontFamily: "'JetBrains Mono'", fontWeight: 700, color: d.cancelRate >= 20 ? '#DC2626' : d.cancelRate >= 10 ? '#F59E0B' : '#374151' }}>
                  {d.cancelRate.toFixed(1)}%
                </span>
              </span>
            </div>
          ))}
          </div>
        </div>
      </div>

      {/* AlignmentContextMenu for all 3 tables */}
      {clientCol.contextMenu.visible && (
        <AlignmentContextMenu
          x={clientCol.contextMenu.x} y={clientCol.contextMenu.y}
          currentAlign={clientCol.columns[clientCol.contextMenu.colIndex]?.align}
          onSelect={align => clientCol.setAlign(clientCol.contextMenu.colIndex, align)}
          onReset={clientCol.resetAll}
          onClose={clientCol.closeMenu}
        />
      )}
      {listCol.contextMenu.visible && (
        <AlignmentContextMenu
          x={listCol.contextMenu.x} y={listCol.contextMenu.y}
          currentAlign={listCol.columns[listCol.contextMenu.colIndex]?.align}
          onSelect={align => listCol.setAlign(listCol.contextMenu.colIndex, align)}
          onReset={listCol.resetAll}
          onClose={listCol.closeMenu}
        />
      )}
      {reschedCol.contextMenu.visible && (
        <AlignmentContextMenu
          x={reschedCol.contextMenu.x} y={reschedCol.contextMenu.y}
          currentAlign={reschedCol.columns[reschedCol.contextMenu.colIndex]?.align}
          onSelect={align => reschedCol.setAlign(reschedCol.contextMenu.colIndex, align)}
          onReset={reschedCol.resetAll}
          onClose={reschedCol.closeMenu}
        />
      )}

    </div>
  );
}