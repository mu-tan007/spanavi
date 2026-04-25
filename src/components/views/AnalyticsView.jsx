import { useState, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';
import PageHeader from '../common/PageHeader';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  fetchCallListsMeta,
  rpcPerfRankingScoped,
  rpcPerfCallHeatmap,
} from '../../lib/supabaseWrite';

import AnalyticsFilters from './analytics/AnalyticsFilters';
import ActionBoard from './analytics/ActionBoard';
import ListAlert from './analytics/ListAlert';
import KPIScorecard from './analytics/KPIScorecard';
import Funnel from './analytics/Funnel';
import Heatmap from './analytics/Heatmap';
import MemberRanking from './analytics/MemberRanking';
import StrengthWeakness from './analytics/StrengthWeakness';
import StatsView from './StatsView';

const NAVY = '#0D2247';

const _jstStart = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
const _jstEnd   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();

function computeDateRange(period, customFrom, customTo, todayStr, weekStartStr, monthStr) {
  if (period === 'day')   return { from: todayStr, to: todayStr };
  if (period === 'week')  return { from: weekStartStr, to: todayStr };
  if (period === 'month') return { from: monthStr + '-01', to: todayStr };
  if (period === 'custom' && customFrom) return { from: customFrom, to: customTo || todayStr };
  return { from: monthStr + '-01', to: todayStr };
}

function computePrevRange(period, range, todayStr, weekStartStr, monthStr) {
  if (period === 'day') {
    const d = new Date(range.from); d.setDate(d.getDate() - 1);
    const s = d.toISOString().slice(0, 10);
    return { from: s, to: s };
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
    const dayOfMonth = parseInt(todayStr.slice(8), 10);
    const maxDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
    return { from: ym + '-01', to: ym + '-' + String(Math.min(dayOfMonth, maxDay)).padStart(2, '0') };
  }
  return null;
}

/**
 * rankByPerson (array of {name, call, connect, appo}) からスコープ絞込してアグリゲート
 */
function aggregateByScope(rank, scope, scopeId, teamMap) {
  let rows = rank || [];
  if (scope === 'member' && scopeId) rows = rows.filter(p => p.name === scopeId);
  else if (scope === 'team' && scopeId) rows = rows.filter(p => teamMap[p.name] === scopeId);
  return {
    calls: rows.reduce((s, p) => s + (p.call || 0), 0),
    ceoConnect: rows.reduce((s, p) => s + (p.connect || 0), 0),
    appo: rows.reduce((s, p) => s + (p.appo || 0), 0),
  };
}

export default function AnalyticsView({ callListData, currentUser, appoData, members, now: nowProp }) {
  const isMobile = useIsMobile();

  const now = nowProp ? new Date(nowProp) : new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const todayD = new Date(todayStr);
  const dayOfWeek = todayD.getDay();
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - ((dayOfWeek + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);

  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [scope, setScope] = useState('org');
  const [scopeId, setScopeId] = useState(null);
  const [listId, setListId] = useState(null);

  const range = useMemo(
    () => computeDateRange(period, customFrom, customTo, todayStr, weekStartStr, monthStr),
    [period, customFrom, customTo, todayStr, weekStartStr, monthStr]
  );

  const prevRange = useMemo(
    () => computePrevRange(period, range, todayStr, weekStartStr, monthStr),
    [period, range, todayStr, weekStartStr, monthStr]
  );

  const [listsMeta, setListsMeta] = useState([]);
  const [rankByPerson, setRankByPerson] = useState([]);       // 現期間の per-person
  const [prevRankByPerson, setPrevRankByPerson] = useState([]); // 前期間の per-person
  const [rankLoading, setRankLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  useEffect(() => {
    fetchCallListsMeta()
      .then(({ data }) => setListsMeta((data || []).filter(l => !l.is_archived)))
      .catch(err => console.error('[AnalyticsView] listsMetaFetch:', err));
  }, []);

  // 現期間・前期間のランキング（per-person count）をサーバーで集計
  useEffect(() => {
    let cancelled = false;
    setRankLoading(true);
    Promise.all([
      rpcPerfRankingScoped(_jstStart(range.from), _jstEnd(range.to), listId),
      prevRange ? rpcPerfRankingScoped(_jstStart(prevRange.from), _jstEnd(prevRange.to), listId) : Promise.resolve({ data: [] }),
    ])
      .then(([cur, prev]) => {
        if (cancelled) return;
        setRankByPerson((cur.data || []).map(r => ({ name: r.getter_name, call: r.calls, connect: r.ceo_connect, appo: r.appo })));
        setPrevRankByPerson((prev.data || []).map(r => ({ name: r.getter_name, call: r.calls, connect: r.ceo_connect, appo: r.appo })));
      })
      .catch(err => console.error('[AnalyticsView] rankFetch:', err))
      .finally(() => { if (!cancelled) setRankLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, prevRange?.from, prevRange?.to, listId]);

  const teamMap = useMemo(() => {
    const m = {};
    (members || [])
      .filter(mb => mb.is_active !== false && mb.name && !/^user_/i.test(mb.name))
      .forEach(mb => { m[mb.name] = mb.team ? mb.team + 'チーム' : '営業統括'; });
    return m;
  }, [members]);

  // ヒートマップ: サーバー集計（現期間 + スコープ + リスト絞込）
  useEffect(() => {
    let cancelled = false;
    setHeatmapLoading(true);
    const opts = {};
    if (scope === 'member' && scopeId) opts.getterName = scopeId;
    else if (scope === 'team' && scopeId) {
      const teamMembers = Object.entries(teamMap).filter(([, t]) => t === scopeId).map(([n]) => n);
      if (teamMembers.length > 0) opts.getterNames = teamMembers;
    }
    if (listId) opts.listId = listId;

    rpcPerfCallHeatmap(_jstStart(range.from), _jstEnd(range.to), opts)
      .then(({ data }) => { if (!cancelled) setHeatmapData(data || []); })
      .catch(err => console.error('[AnalyticsView] heatmapFetch:', err))
      .finally(() => { if (!cancelled) setHeatmapLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, scope, scopeId, listId, teamMap]);

  // スコープ絞込したアグリゲート
  const scopedStats = useMemo(
    () => aggregateByScope(rankByPerson, scope, scopeId, teamMap),
    [rankByPerson, scope, scopeId, teamMap]
  );
  const prevScopedStats = useMemo(
    () => aggregateByScope(prevRankByPerson, scope, scopeId, teamMap),
    [prevRankByPerson, scope, scopeId, teamMap]
  );

  // 組織全体のアグリゲート（StrengthWeakness や ActionBoard で使用）
  const orgStats = useMemo(
    () => aggregateByScope(rankByPerson, 'org', null, teamMap),
    [rankByPerson, teamMap]
  );

  const scopedAppoData = useMemo(() => {
    let rows = appoData || [];
    if (scope === 'member' && scopeId) rows = rows.filter(a => a.getter === scopeId);
    else if (scope === 'team' && scopeId) rows = rows.filter(a => teamMap[a.getter] === scopeId);
    return rows;
  }, [appoData, scope, scopeId, teamMap]);

  const selectedListName = useMemo(
    () => listId ? (listsMeta.find(l => l.id === listId)?.name || null) : null,
    [listId, listsMeta]
  );

  const scopeLabel = useMemo(() => {
    if (scope === 'org') return '組織全体';
    if (scope === 'team') return scopeId || '全チーム';
    if (scope === 'member') return scopeId || '全メンバー';
    return '';
  }, [scope, scopeId]);

  const memberStats = useMemo(() => {
    if (scope !== 'member' || !scopeId) return null;
    const p = rankByPerson.find(r => r.name === scopeId);
    if (!p) return { calls: 0, ceoConnect: 0, appo: 0 };
    return { calls: p.call, ceoConnect: p.connect, appo: p.appo };
  }, [rankByPerson, scope, scopeId]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        eyebrow="Sourcing · Strategic Analytics"
        title="Analytics"
        description="組織・チーム・個人を俯瞰する戦略分析"
        style={{ marginBottom: isMobile ? 16 : 20 }}
      />

      <AnalyticsFilters
        period={period} setPeriod={setPeriod}
        from={customFrom} setFrom={setCustomFrom}
        to={customTo} setTo={setCustomTo}
        scope={scope} setScope={setScope}
        scopeId={scopeId} setScopeId={setScopeId}
        listId={listId} setListId={setListId}
        members={members}
        lists={listsMeta}
        teamMap={teamMap}
      />

      <div style={{ fontSize: 11, color: C.textLight, marginBottom: 16, padding: '0 4px' }}>
        対象: <b style={{ color: NAVY }}>{scopeLabel}</b>
        {selectedListName && <> / リスト: <b style={{ color: NAVY }}>{selectedListName}</b></>}
        {' '}・ 期間: <b style={{ color: NAVY }}>{range.from} 〜 {range.to}</b>
        {prevRange && <> / 前期: <b style={{ color: NAVY }}>{prevRange.from} 〜 {prevRange.to}</b></>}
      </div>

      <ActionBoard
        heatmapData={heatmapData}
        orgStats={orgStats}
        callListData={callListData}
        rankByPerson={rankByPerson}
      />

      <ListAlert callListData={callListData} />

      <KPIScorecard
        stats={scopedStats}
        prevStats={prevScopedStats}
        appoData={scopedAppoData}
        period={period}
        range={range}
        prevRange={prevRange}
        todayStr={todayStr}
        loading={rankLoading}
      />

      <Funnel
        stats={scopedStats}
        appoData={scopedAppoData}
        from={range.from}
        to={range.to}
        loading={rankLoading}
      />

      <Heatmap
        heatmapData={heatmapData}
        loading={heatmapLoading}
        listName={selectedListName}
      />

      <MemberRanking
        from={range.from}
        to={range.to}
        currentUser={currentUser}
        members={members}
        appoData={scopedAppoData}
      />

      {scope === 'member' && scopeId && memberStats && (
        <StrengthWeakness
          memberName={scopeId}
          myStats={memberStats}
          orgStats={orgStats}
        />
      )}

      <div style={{ margin: '28px 0 20px', borderTop: '1px solid ' + C.border, paddingTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>売上・クライアント・リスト別分析</div>
        <div style={{ fontSize: 11, color: C.textLight }}>（以下のセクションは独自の期間/絞込を持ちます）</div>
      </div>

      <StatsView
        callListData={callListData}
        currentUser={currentUser}
        appoData={appoData}
        members={members}
        now={nowProp}
        embedded={true}
      />
    </div>
  );
}
