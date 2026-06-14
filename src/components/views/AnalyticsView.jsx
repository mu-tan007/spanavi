import { useState, useEffect, useMemo } from 'react';
import { color, space, radius, font } from '../../constants/design';
import { Select } from '../ui';
import PageHeader from '../common/PageHeader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useUrlState } from '../../hooks/useUrlState';
import { rpcPerfRankingScoped, rpcPerfCallHeatmap } from '../../lib/supabaseWrite';

import Heatmap from './analytics/Heatmap';
import OverallSummary from './analytics/OverallSummary';
import SalesRanking from './analytics/SalesRanking';
import TeamComparison from './analytics/TeamComparison';
import PerformanceTable from './analytics/PerformanceTable';

const _jstStart = (ds) => new Date(ds + 'T00:00:00+09:00').toISOString();
const _jstEnd   = (ds) => new Date(ds + 'T23:59:59.999+09:00').toISOString();

// 直近12ヶ月の月セレクタ選択肢
function buildMonthOptions(todayStr) {
  const [yy, mm] = todayStr.slice(0, 7).split('-').map(Number);
  const opts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(yy, mm - 1 - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opts.push({ value: ym, label: `${d.getFullYear()}年${d.getMonth() + 1}月` });
  }
  return opts;
}

// 期間 → { from, to }（行動日ベース）。売上は別途 salesPeriod.js が月判定する。
function computeRange(period, customFrom, customTo, todayStr, weekStartStr, monthStr) {
  if (period === 'day')   return { from: todayStr, to: todayStr };
  if (period === 'week')  return { from: weekStartStr, to: todayStr };
  if (period === 'custom' && customFrom) return { from: customFrom, to: customTo || todayStr };
  // month: 当月は今日まで、過去月は月末まで
  const [y, m] = monthStr.split('-').map(Number);
  const isCurrent = monthStr === todayStr.slice(0, 7);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${monthStr}-01`, to: isCurrent ? todayStr : `${monthStr}-${String(lastDay).padStart(2, '0')}` };
}

function aggregateOrg(rank) {
  return {
    calls: rank.reduce((s, p) => s + (p.call || 0), 0),
    keymanConnect: rank.reduce((s, p) => s + (p.connect || 0), 0),
    appo: rank.reduce((s, p) => s + (p.appo || 0), 0),
  };
}

export default function AnalyticsView({ callListData, currentUser, appoData, members, now: nowProp }) {
  const isMobile = useIsMobile();
  const now = nowProp ? new Date(nowProp) : new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const todayD = new Date(todayStr);
  const weekStart = new Date(todayD); weekStart.setDate(todayD.getDate() - ((todayD.getDay() + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const curMonth = todayStr.slice(0, 7);

  const [period, setPeriod]         = useUrlState('an_period', 'month', { allowed: ['day', 'week', 'month', 'custom'] });
  const [monthStr, setMonthStr]     = useUrlState('an_month', curMonth);
  const [customFrom, setCustomFrom] = useUrlState('an_from', '');
  const [customTo, setCustomTo]     = useUrlState('an_to', '');

  const monthOptions = useMemo(() => buildMonthOptions(todayStr), [todayStr]);
  const range = useMemo(
    () => computeRange(period, customFrom, customTo, todayStr, weekStartStr, monthStr),
    [period, customFrom, customTo, todayStr, weekStartStr, monthStr]
  );

  // 全社の行動量（架電/接続/アポ）。OverallSummary用。
  const [rankByPerson, setRankByPerson] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    rpcPerfRankingScoped(_jstStart(range.from), _jstEnd(range.to), null)
      .then(({ data }) => {
        if (cancelled) return;
        setRankByPerson((data || []).map(r => ({ name: r.getter_name, call: r.calls, connect: r.keyman_connect, appo: r.appo })));
      })
      .catch(err => console.error('[AnalyticsView] rankFetch:', err));
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  useEffect(() => {
    let cancelled = false;
    setHeatmapLoading(true);
    rpcPerfCallHeatmap(_jstStart(range.from), _jstEnd(range.to), {})
      .then(({ data }) => { if (!cancelled) setHeatmapData(data || []); })
      .catch(err => console.error('[AnalyticsView] heatmapFetch:', err))
      .finally(() => { if (!cancelled) setHeatmapLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const teamMap = useMemo(() => {
    const m = {};
    (members || [])
      .filter(mb => mb.is_active !== false && mb.name && !/^user_/i.test(mb.name))
      .forEach(mb => { m[mb.name] = mb.team || ''; });
    return m;
  }, [members]);

  const orgStats = useMemo(() => aggregateOrg(rankByPerson), [rankByPerson]);

  const periodBtn = (p, active) => ({
    padding: '8px 16px', borderRadius: radius.md, cursor: 'pointer', fontFamily: font.family.sans,
    fontSize: font.size.sm, fontWeight: active ? font.weight.semibold : font.weight.normal,
    border: `1px solid ${active ? color.navy : color.border}`,
    background: active ? color.navy : color.white, color: active ? color.white : color.textMid,
  });

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', paddingBottom: 40 }}>
      <PageHeader title="アナリティクス" description="全社の数字を俯瞰する" style={{ marginBottom: isMobile ? 12 : 16 }} />

      {/* 期間フィルタ */}
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[4] }}>
        <div style={{ display: 'flex', gap: space[1] }}>
          {[['day', '今日'], ['week', '今週'], ['month', '月'], ['custom', '期間指定']].map(([p, l]) => (
            <button key={p} onClick={() => setPeriod(p)} style={periodBtn(p, period === p)}>{l}</button>
          ))}
        </div>
        {period === 'month' && (
          <div style={{ minWidth: 140 }}>
            <Select size="sm" value={monthStr} onChange={e => setMonthStr(e.target.value)} options={monthOptions} />
          </div>
        )}
        {period === 'custom' && (
          <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '6px 8px', border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.sm, fontFamily: font.family.sans }} />
            <span style={{ color: color.textLight }}>〜</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '6px 8px', border: `1px solid ${color.border}`, borderRadius: radius.md, fontSize: font.size.sm, fontFamily: font.family.sans }} />
          </div>
        )}
        <span style={{ fontSize: font.size.xs, color: color.textLight, marginLeft: 'auto' }}>
          {range.from} 〜 {range.to}
        </span>
      </div>

      {/* ① 実績サマリー */}
      <OverallSummary stats={orgStats} appoData={appoData} range={range} period={period} monthStr={monthStr} />

      {/* ② 個人別 売上ランキング */}
      <SalesRanking appoData={appoData} range={range} period={period} monthStr={monthStr} teamMap={teamMap} />

      {/* ③ チーム比較（メンバー展開・シフト/稼働込み） */}
      <TeamComparison appoData={appoData} range={range} />

      {/* ④ 曜日×時間帯 ヒートマップ（全社接続率） */}
      <div style={{ marginBottom: space[5] }}>
        <Heatmap heatmapData={heatmapData} loading={heatmapLoading} listName={null} />
      </div>

      {/* ⑤ クライアント別パフォーマンス */}
      <PerformanceTable range={range} groupBy="client" title="クライアント別 パフォーマンス" />

      {/* ⑥ リスト別パフォーマンス */}
      <PerformanceTable range={range} groupBy="list" title="リスト別 パフォーマンス" />
    </div>
  );
}
