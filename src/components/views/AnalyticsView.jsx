import { useState, useEffect, useMemo } from 'react';
import { C } from '../../constants/colors';
import PageHeader from '../common/PageHeader';
import { useCallStatuses } from '../../hooks/useCallStatuses';
import { useIsMobile } from '../../hooks/useIsMobile';
import { fetchCallRecordsByRange, fetchCallListsMeta, rpcPerfRanking } from '../../lib/supabaseWrite';

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

export default function AnalyticsView({ callListData, currentUser, appoData, members, now: nowProp }) {
  const isMobile = useIsMobile();
  const { ceoConnectLabels } = useCallStatuses();

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

  const [callRecords, setCallRecords] = useState([]);
  const [prevCallRecords, setPrevCallRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [listsMeta, setListsMeta] = useState([]);
  const [rankByPerson, setRankByPerson] = useState([]);

  useEffect(() => {
    fetchCallListsMeta()
      .then(({ data }) => setListsMeta((data || []).filter(l => !l.is_archived)))
      .catch(err => console.error('[AnalyticsView] listsMetaFetch:', err));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRecordsLoading(true);
    Promise.all([
      fetchCallRecordsByRange(_jstStart(range.from), _jstEnd(range.to)),
      prevRange ? fetchCallRecordsByRange(_jstStart(prevRange.from), _jstEnd(prevRange.to)) : Promise.resolve({ data: [] }),
    ])
      .then(([cur, prev]) => {
        if (cancelled) return;
        setCallRecords(cur.data || []);
        setPrevCallRecords(prev.data || []);
      })
      .catch(err => console.error('[AnalyticsView] recordsFetch:', err))
      .finally(() => { if (!cancelled) setRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, prevRange?.from, prevRange?.to]);

  // ActionBoard が使うランキング用データ（メンバーの平均乖離検出）
  useEffect(() => {
    let cancelled = false;
    rpcPerfRanking(_jstStart(range.from), _jstEnd(range.to))
      .then(({ data }) => {
        if (cancelled) return;
        setRankByPerson((data || []).map(r => ({ name: r.getter_name, call: r.calls, connect: r.ceo_connect, appo: r.appo })));
      })
      .catch(err => console.error('[AnalyticsView] rankFetch:', err));
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const teamMap = useMemo(() => {
    const m = {};
    (members || [])
      .filter(mb => mb.is_active !== false && mb.name && !/^user_/i.test(mb.name))
      .forEach(mb => { m[mb.name] = mb.team ? mb.team + 'チーム' : '営業統括'; });
    return m;
  }, [members]);

  const scopedRecords = useMemo(() => {
    let rows = callRecords;
    if (scope === 'member' && scopeId) rows = rows.filter(r => r.getter_name === scopeId);
    else if (scope === 'team' && scopeId) rows = rows.filter(r => teamMap[r.getter_name] === scopeId);
    if (listId) rows = rows.filter(r => r.list_id === listId);
    return rows;
  }, [callRecords, scope, scopeId, listId, teamMap]);

  const scopedPrevRecords = useMemo(() => {
    let rows = prevCallRecords;
    if (scope === 'member' && scopeId) rows = rows.filter(r => r.getter_name === scopeId);
    else if (scope === 'team' && scopeId) rows = rows.filter(r => teamMap[r.getter_name] === scopeId);
    if (listId) rows = rows.filter(r => r.list_id === listId);
    return rows;
  }, [prevCallRecords, scope, scopeId, listId, teamMap]);

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

  const memberRecordsForComparison = useMemo(() => {
    if (scope !== 'member' || !scopeId) return [];
    return callRecords.filter(r => r.getter_name === scopeId);
  }, [callRecords, scope, scopeId]);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        eyebrow="Sourcing · Strategic Analytics"
        title="Analytics"
        description="組織・チーム・個人を俯瞰する戦略分析ダッシュボード"
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
        callRecords={scopedRecords}
        callListData={callListData}
        rankByPerson={rankByPerson}
        ceoConnectLabels={ceoConnectLabels}
      />

      <ListAlert callListData={callListData} />

      <KPIScorecard
        callRecords={scopedRecords}
        prevCallRecords={scopedPrevRecords}
        appoData={scopedAppoData}
        ceoConnectLabels={ceoConnectLabels}
        period={period}
        range={range}
        prevRange={prevRange}
        todayStr={todayStr}
        loading={recordsLoading}
      />

      <Funnel
        callRecords={scopedRecords}
        appoData={scopedAppoData}
        ceoConnectLabels={ceoConnectLabels}
        from={range.from}
        to={range.to}
        loading={recordsLoading}
      />

      <Heatmap
        callRecords={scopedRecords}
        ceoConnectLabels={ceoConnectLabels}
        loading={recordsLoading}
        listName={selectedListName}
      />

      <MemberRanking
        from={range.from}
        to={range.to}
        currentUser={currentUser}
        members={members}
        appoData={scopedAppoData}
      />

      {scope === 'member' && scopeId && (
        <StrengthWeakness
          memberName={scopeId}
          allCallRecords={callRecords}
          memberCallRecords={memberRecordsForComparison}
          ceoConnectLabels={ceoConnectLabels}
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
