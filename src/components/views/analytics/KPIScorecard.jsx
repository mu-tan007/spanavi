import { useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';
import { formatCurrency } from '../../../utils/formatters';

const COUNTABLE = new Set(['面談済', '事前確認済', 'アポ取得']);

function pacingInfo(period, todayStr, range) {
  if (period !== 'month' && period !== 'week') return null;
  const today = new Date(todayStr + 'T00:00:00+09:00');
  const from = new Date(range.from + 'T00:00:00+09:00');
  let end;
  if (period === 'month') {
    const [y, m] = range.from.slice(0, 7).split('-').map(Number);
    end = new Date(y, m, 0);
    end = new Date(end.toISOString().slice(0, 10) + 'T23:59:59+09:00');
  } else {
    end = new Date(from); end.setDate(end.getDate() + 6);
    end = new Date(end.toISOString().slice(0, 10) + 'T23:59:59+09:00');
  }
  const totalMs = end - from;
  const elapsedMs = Math.min(today - from + 86400000, totalMs);
  const ratio = totalMs > 0 ? Math.max(elapsedMs / totalMs, 0.01) : 1;
  return { ratio, elapsedDays: Math.max(Math.floor(elapsedMs / 86400000), 0), totalDays: Math.floor(totalMs / 86400000) + 1 };
}

function MetricCard({ label, value, unit, sub, predicted, deltaPct, isMoney, accent, small }) {
  const gain = deltaPct != null && deltaPct >= 0;
  return (
    <div style={{
      background: color.white, border: `1px solid ${color.border}`,
      borderRadius: radius.md, padding: '14px 16px', minWidth: 0,
    }}>
      <div style={{
        fontSize: 10, color: color.textLight, fontWeight: font.weight.bold,
        letterSpacing: font.letterSpacing.wide, marginBottom: 6, textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{
          fontSize: small ? 18 : 22, fontWeight: 900,
          color: accent || color.navy, fontFamily: font.family.mono,
          letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums',
        }}>
          {isMoney ? formatCurrency(value || 0) : (value || 0).toLocaleString()}
        </div>
        {unit && <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.textMid }}>{unit}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 10 }}>
        {deltaPct != null && (
          <span style={{
            color: gain ? color.success : color.danger,
            fontWeight: font.weight.bold, fontFamily: font.family.mono,
          }}>
            {gain ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
        {sub && <span style={{ color: color.textLight }}>{sub}</span>}
      </div>
      {predicted != null && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: `1px dashed ${color.border}`,
          fontSize: 10, color: color.textMid,
        }}>
          着地予測: <b style={{ color: color.navy, fontFamily: font.family.mono }}>{isMoney ? formatCurrency(predicted) : Math.round(predicted).toLocaleString() + (unit || '')}</b>
        </div>
      )}
    </div>
  );
}

export default function KPIScorecard({
  stats,          // { calls, keymanConnect, appo }
  prevStats,      // { calls, keymanConnect, appo }
  appoData = [],
  period,
  range,
  prevRange,
  todayStr,
  loading = false,
}) {
  const pacing = useMemo(() => pacingInfo(period, todayStr, range), [period, todayStr, range]);

  const metrics = useMemo(() => {
    const calls = stats?.calls || 0;
    const keymanConnect = stats?.keymanConnect || 0;
    const appo = stats?.appo || 0;
    const appoRate = calls > 0 ? (appo / calls) * 100 : 0;
    const connectRate = calls > 0 ? (keymanConnect / calls) * 100 : 0;

    const prevCalls = prevStats?.calls || 0;
    const prevKeyman = prevStats?.keymanConnect || 0;
    const prevAppo = prevStats?.appo || 0;
    const prevAppoRate = prevCalls > 0 ? (prevAppo / prevCalls) * 100 : 0;
    const prevConnectRate = prevCalls > 0 ? (prevKeyman / prevCalls) * 100 : 0;

    const inRange = (a, r) => {
      const d = (a.getDate || '').slice(0, 10);
      return (!r.from || d >= r.from) && (!r.to || d <= r.to);
    };
    const periodAppos = (appoData || []).filter(a => COUNTABLE.has(a.status) && inRange(a, range));
    // 新規開拓リスト由来のアポは売上集計から除外（件数 KPI には含める）
    const sales = periodAppos.reduce((s, a) => s + (a.isProspecting ? 0 : (a.sales || 0)), 0);
    const prevPeriodAppos = prevRange ? (appoData || []).filter(a => COUNTABLE.has(a.status) && inRange(a, prevRange)) : [];
    const prevSales = prevPeriodAppos.reduce((s, a) => s + (a.isProspecting ? 0 : (a.sales || 0)), 0);

    const reschedInRange = (appoData || []).filter(a => inRange(a, range) && a.status === 'リスケ中').length;
    const cancelInRange = (appoData || []).filter(a => inRange(a, range) && a.status === 'キャンセル').length;
    const appoTotalInRange = periodAppos.length + reschedInRange + cancelInRange;
    const badRate = appoTotalInRange > 0 ? (reschedInRange + cancelInRange) / appoTotalInRange * 100 : 0;

    const pct = (cur, prev) => (prev > 0 ? (cur - prev) / prev * 100 : null);
    const ratio = pacing?.ratio || null;

    return {
      sales: { value: sales, prev: prevSales, delta: pct(sales, prevSales), predicted: ratio ? sales / ratio : null },
      appo: { value: appo, prev: prevAppo, delta: pct(appo, prevAppo), predicted: ratio ? appo / ratio : null },
      calls: { value: calls, prev: prevCalls, delta: pct(calls, prevCalls), predicted: ratio ? calls / ratio : null },
      appoRate: { value: appoRate, prev: prevAppoRate, deltaPt: appoRate - prevAppoRate },
      connectRate: { value: connectRate, prev: prevConnectRate, deltaPt: connectRate - prevConnectRate },
      badRate: { value: badRate, resched: reschedInRange, cancel: cancelInRange, total: appoTotalInRange },
    };
  }, [stats, prevStats, appoData, range, prevRange, pacing]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>読込中…</div>;
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{
        fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy,
        borderBottom: `2px solid ${color.navy}`, paddingBottom: 6, marginBottom: 14,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      }}>
        <span>KPIスコアカード</span>
        {pacing && (
          <span style={{ fontSize: 10, color: color.textLight, fontWeight: font.weight.medium }}>
            期間経過: {pacing.elapsedDays}/{pacing.totalDays}日 ({(pacing.ratio * 100).toFixed(0)}%)
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <MetricCard label="売上" value={metrics.sales.value} isMoney predicted={metrics.sales.predicted} deltaPct={metrics.sales.delta} sub="前期比" />
        <MetricCard label="アポ数" value={metrics.appo.value} unit="件" predicted={metrics.appo.predicted} deltaPct={metrics.appo.delta} sub="前期比" />
        <MetricCard label="架電数" value={metrics.calls.value} unit="件" predicted={metrics.calls.predicted} deltaPct={metrics.calls.delta} sub="前期比" />
        <MetricCard label="アポ率" value={metrics.appoRate.value.toFixed(1)} unit="%" deltaPct={null} sub={metrics.appoRate.deltaPt != null ? `前期比 ${metrics.appoRate.deltaPt >= 0 ? '+' : ''}${metrics.appoRate.deltaPt.toFixed(1)}pt` : null} small />
        <MetricCard label="キーマン接続率" value={metrics.connectRate.value.toFixed(1)} unit="%" deltaPct={null} sub={metrics.connectRate.deltaPt != null ? `前期比 ${metrics.connectRate.deltaPt >= 0 ? '+' : ''}${metrics.connectRate.deltaPt.toFixed(1)}pt` : null} small />
        <MetricCard label="リスケ+キャンセル率" value={metrics.badRate.value.toFixed(1)} unit="%" accent={metrics.badRate.value > 20 ? color.danger : color.navy} sub={`リスケ${metrics.badRate.resched}/キャンセル${metrics.badRate.cancel} / アポ計${metrics.badRate.total}`} small />
      </div>
    </section>
  );
}
