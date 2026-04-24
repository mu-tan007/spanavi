import { useMemo } from 'react';
import { C } from '../../../constants/colors';
import { formatCurrency } from '../../../utils/formatters';

const NAVY = '#0D2247';
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

function Card({ label, value, unit, sub, predicted, deltaPct, isMoney, accent, small }) {
  const gain = deltaPct != null && deltaPct >= 0;
  return (
    <div style={{ background: '#fff', border: '1px solid ' + C.border, borderRadius: 4, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 10, color: C.textLight, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{ fontSize: small ? 18 : 22, fontWeight: 900, color: accent || NAVY, fontFamily: "'JetBrains Mono'", letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
          {isMoney ? formatCurrency(value || 0) : (value || 0).toLocaleString()}
        </div>
        {unit && <div style={{ fontSize: 11, fontWeight: 600, color: C.textMid }}>{unit}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 10 }}>
        {deltaPct != null && (
          <span style={{ color: gain ? '#16a34a' : '#dc2626', fontWeight: 700, fontFamily: "'JetBrains Mono'" }}>
            {gain ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
        {sub && <span style={{ color: C.textLight }}>{sub}</span>}
      </div>
      {predicted != null && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed ' + C.border, fontSize: 10, color: C.textMid }}>
          着地予測: <b style={{ color: NAVY, fontFamily: "'JetBrains Mono'" }}>{isMoney ? formatCurrency(predicted) : Math.round(predicted).toLocaleString() + (unit || '')}</b>
        </div>
      )}
    </div>
  );
}

export default function KPIScorecard({
  callRecords = [],
  prevCallRecords = [],
  appoData = [],
  ceoConnectLabels,
  period,
  range,
  prevRange,
  todayStr,
  loading = false,
}) {
  const pacing = useMemo(() => pacingInfo(period, todayStr, range), [period, todayStr, range]);

  const metrics = useMemo(() => {
    const calls = callRecords.length;
    const ceoConnect = callRecords.filter(r => ceoConnectLabels?.has(r.status)).length;
    const appo = callRecords.filter(r => r.status === 'アポ獲得').length;
    const appoRate = calls > 0 ? (appo / calls) * 100 : 0;
    const connectRate = calls > 0 ? (ceoConnect / calls) * 100 : 0;

    const prevCalls = prevCallRecords.length;
    const prevCeo = prevCallRecords.filter(r => ceoConnectLabels?.has(r.status)).length;
    const prevAppo = prevCallRecords.filter(r => r.status === 'アポ獲得').length;
    const prevAppoRate = prevCalls > 0 ? (prevAppo / prevCalls) * 100 : 0;
    const prevConnectRate = prevCalls > 0 ? (prevCeo / prevCalls) * 100 : 0;

    const inRange = (a, r) => {
      const d = (a.getDate || '').slice(0, 10);
      return (!r.from || d >= r.from) && (!r.to || d <= r.to);
    };
    const periodAppos = (appoData || []).filter(a => COUNTABLE.has(a.status) && inRange(a, range));
    const sales = periodAppos.reduce((s, a) => s + (a.sales || 0), 0);
    const prevPeriodAppos = prevRange ? (appoData || []).filter(a => COUNTABLE.has(a.status) && inRange(a, prevRange)) : [];
    const prevSales = prevPeriodAppos.reduce((s, a) => s + (a.sales || 0), 0);

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
  }, [callRecords, prevCallRecords, appoData, ceoConnectLabels, range, prevRange, pacing]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 12 }}>読込中…</div>;
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span>KPIスコアカード</span>
        {pacing && (
          <span style={{ fontSize: 10, color: C.textLight, fontWeight: 500 }}>
            期間経過: {pacing.elapsedDays}/{pacing.totalDays}日 ({(pacing.ratio * 100).toFixed(0)}%)
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <Card label="売上" value={metrics.sales.value} isMoney predicted={metrics.sales.predicted} deltaPct={metrics.sales.delta} sub="前期比" />
        <Card label="アポ数" value={metrics.appo.value} unit="件" predicted={metrics.appo.predicted} deltaPct={metrics.appo.delta} sub="前期比" />
        <Card label="架電数" value={metrics.calls.value} unit="件" predicted={metrics.calls.predicted} deltaPct={metrics.calls.delta} sub="前期比" />
        <Card label="アポ率" value={metrics.appoRate.value.toFixed(1)} unit="%" deltaPct={null} sub={metrics.appoRate.deltaPt != null ? `前期比 ${metrics.appoRate.deltaPt >= 0 ? '+' : ''}${metrics.appoRate.deltaPt.toFixed(1)}pt` : null} small />
        <Card label="社長接続率" value={metrics.connectRate.value.toFixed(1)} unit="%" deltaPct={null} sub={metrics.connectRate.deltaPt != null ? `前期比 ${metrics.connectRate.deltaPt >= 0 ? '+' : ''}${metrics.connectRate.deltaPt.toFixed(1)}pt` : null} small />
        <Card label="リスケ+キャンセル率" value={metrics.badRate.value.toFixed(1)} unit="%" accent={metrics.badRate.value > 20 ? '#EF4444' : NAVY} sub={`リスケ${metrics.badRate.resched}/キャンセル${metrics.badRate.cancel} / アポ計${metrics.badRate.total}`} small />
      </div>
    </section>
  );
}
