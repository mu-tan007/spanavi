import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import PageHeader from '../common/PageHeader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useUrlState } from '../../hooks/useUrlState';
import {
  fetchCallListsMeta,
  rpcPerfRankingScoped,
  rpcPerfCallHeatmap,
} from '../../lib/supabaseWrite';

import AnalyticsFilters from './analytics/AnalyticsFilters';
import Funnel from './analytics/Funnel';
import Heatmap from './analytics/Heatmap';
import MemberRanking from './analytics/MemberRanking';
import StrengthWeakness from './analytics/StrengthWeakness';
import IndustryAnalytics from './analytics/IndustryAnalytics';
import AppoPatternAnalytics from './analytics/AppoPatternAnalytics';
import OverallSummary from './analytics/OverallSummary';
import TeamComparison from './analytics/TeamComparison';
import ConversionPanel from './analytics/ConversionPanel';
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
    keymanConnect: rows.reduce((s, p) => s + (p.connect || 0), 0),
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

  // ハードリロード/URL共有で状態保持するため URL クエリに同期
  // 3タブ構成: overall(全体の数字) / team(チームごと) / client(クライアント・リスト)
  const [tab, setTab] = useUrlState('an_tab', 'overall', { allowed: ['overall', 'team', 'client'] });
  const [period, setPeriod]         = useUrlState('period', 'month', { allowed: ['day', 'week', 'month', 'custom'] });
  const [customFrom, setCustomFrom] = useUrlState('from', '');
  const [customTo, setCustomTo]     = useUrlState('to', '');
  const [scope, setScope]           = useUrlState('scope', 'org', { allowed: ['org', 'team', 'member'] });
  const [scopeId, setScopeId]       = useUrlState('scopeId', null);
  const [listId, setListId]         = useUrlState('listId', null);

  // scope と scopeId は同時更新したいので、useUrlState の連続呼び出し race を避けて
  // useSearchParams で 1 回の setSearchParams にまとめる
  const [, setSearchParams] = useSearchParams();
  const onScopeChange = useCallback((newScope) => {
    setSearchParams(prev => {
      const np = new URLSearchParams(prev);
      if (newScope === 'org') np.delete('scope');
      else np.set('scope', newScope);
      np.delete('scopeId');
      return np;
    }, { replace: true });
  }, [setSearchParams]);

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
        setRankByPerson((cur.data || []).map(r => ({ name: r.getter_name, call: r.calls, connect: r.keyman_connect, appo: r.appo })));
        setPrevRankByPerson((prev.data || []).map(r => ({ name: r.getter_name, call: r.calls, connect: r.keyman_connect, appo: r.appo })));
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
    if (!p) return { calls: 0, keymanConnect: 0, appo: 0 };
    return { calls: p.call, keymanConnect: p.connect, appo: p.appo };
  }, [rankByPerson, scope, scopeId]);

  const TABS = [
    { id: 'overall', label: '全体の数字' },
    { id: 'team', label: 'チームごとの数字' },
    { id: 'client', label: 'クライアント・リストごとの数字' },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        title="アナリティクス"
        description="全体・チーム・案件を俯瞰する分析"
        style={{ marginBottom: isMobile ? 12 : 16 }}
      />

      {/* タブバー */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${color.border}`, marginBottom: space[4], overflowX: 'auto' }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: font.size.sm, fontFamily: font.family.sans, whiteSpace: 'nowrap',
                fontWeight: active ? font.weight.semibold : font.weight.normal,
                color: active ? color.navy : color.textMid,
                borderBottom: `2px solid ${active ? color.gold : 'transparent'}`, marginBottom: -1,
              }}>{t.label}</button>
          );
        })}
      </div>

      {/* 期間フィルタ（全タブ共通）。チーム/メンバー絞り込みは team タブでのみ意味を持つ */}
      <AnalyticsFilters
        period={period} setPeriod={setPeriod}
        from={customFrom} setFrom={setCustomFrom}
        to={customTo} setTo={setCustomTo}
        scope={scope} setScope={onScopeChange}
        scopeId={scopeId} setScopeId={setScopeId}
        listId={listId} setListId={setListId}
        members={members}
        lists={listsMeta}
        teamMap={teamMap}
        hideScope={tab !== 'team'}
      />

      <div style={{ fontSize: font.size.xs, color: color.textLight, marginBottom: 16, padding: '0 4px' }}>
        {tab === 'team' && <>対象: <b style={{ color: NAVY }}>{scopeLabel}</b>{' '}・ </>}
        期間: <b style={{ color: NAVY }}>{range.from} 〜 {range.to}</b>
      </div>

      {/* ── タブ① 全体の数字 ── */}
      {tab === 'overall' && (
        <>
          <OverallSummary stats={orgStats} appoData={appoData} range={range} />
          <Funnel stats={orgStats} appoData={appoData} from={range.from} to={range.to} loading={rankLoading} />
          <Heatmap heatmapData={heatmapData} loading={heatmapLoading} listName={selectedListName} />
          <AppoPatternAnalytics from={range.from} to={range.to} memberName={null} />
          <IndustryAnalytics />
        </>
      )}

      {/* ── タブ② チームごとの数字 ── */}
      {tab === 'team' && (
        <>
          <TeamComparison rankByPerson={rankByPerson} appoData={appoData} range={range} teamMap={teamMap} />
          <MemberRanking from={range.from} to={range.to} currentUser={currentUser} members={members} appoData={scopedAppoData} />
          <ConversionPanel appoData={scopedAppoData} range={range} by="getter" title="メンバー別 アポ転換率" />
          {scope === 'member' && scopeId && memberStats && (
            <StrengthWeakness memberName={scopeId} myStats={memberStats} orgStats={orgStats} />
          )}
        </>
      )}

      {/* ── タブ③ クライアント・リストごとの数字 ── */}
      {tab === 'client' && (
        <>
          <ConversionPanel appoData={appoData} range={range} by="client" title="クライアント別 アポ転換率" />
          <StatsView
            callListData={callListData}
            currentUser={currentUser}
            appoData={appoData}
            members={members}
            now={nowProp}
            embedded={true}
          />
        </>
      )}
    </div>
  );
}
