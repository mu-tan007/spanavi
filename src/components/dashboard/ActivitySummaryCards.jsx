import { C } from '../../constants/colors';
import { useCallStatuses } from '../../hooks/useCallStatuses';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';

function GrowthBadge({ cur, prev }) {
  if (!prev) return <span style={{ fontSize: 10, color: C.textLight }}>前期比 —</span>;
  const pct = (cur - prev) / prev * 100;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? '#16a34a' : '#dc2626' }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function ActivitySummaryCards({
  records, prevRecords,
  period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
  loading,
}) {
  const { ceoConnectLabels } = useCallStatuses();

  const aggregate = (recs) => {
    const total = recs.length;
    const ceoConnect = recs.filter(r => ceoConnectLabels.has(r.status)).length;
    const appo = recs.filter(r => r.status === 'アポ獲得').length;
    return { total, ceoConnect, appo };
  };

  const cur = aggregate(records);
  const prev = aggregate(prevRecords);
  const connectRate = cur.total > 0 ? (cur.ceoConnect / cur.total * 100).toFixed(1) : '0.0';
  const appoRate = cur.total > 0 ? (cur.appo / cur.total * 100).toFixed(1) : '0.0';

  const tabBtn = (active) => ({
    padding: '6px 12px', fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer',
    background: 'transparent', border: 'none',
    borderBottom: '2px solid ' + (active ? NAVY : 'transparent'),
    color: active ? NAVY : '#9CA3AF', borderRadius: 0, fontFamily: "'Noto Sans JP'",
    transition: 'all 0.15s',
  });
  const dateInputStyle = {
    padding: '3px 6px', borderRadius: 4, border: '1px solid ' + C.border,
    fontSize: 11, color: C.textDark, outline: 'none', fontFamily: "'Noto Sans JP'",
  };
  const cardStyle = {
    background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: '20px 22px',
    borderLeft: '2px solid #0D2247', flex: 1,
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 8, marginBottom: 12 }}>活動サマリー</span>
          {loading && <span style={{ fontSize: 10, color: C.textLight }}>読込中…</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #E5E7EB' }}>
          {[['day', '日'], ['week', '週'], ['month', '月'], ['custom', '期間指定']].map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k)}>{l}</button>
          ))}
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type='date' value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={dateInputStyle} />
              <span style={{ fontSize: 10, color: C.textLight }}>〜</span>
              <input type='date' value={customTo} onChange={e => setCustomTo(e.target.value)} style={dateInputStyle} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        {/* 総架電数 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>総架電数</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'", fontVariantNumeric: 'tabular-nums' }}>
            {cur.total}<span style={{ fontSize: 13, fontWeight: 600 }}>件</span>
          </div>
          <div style={{ marginTop: 6 }}><GrowthBadge cur={cur.total} prev={prev.total} /></div>
          {prev.total > 0 && <div style={{ fontSize: 10, color: C.textLight, marginTop: 2 }}>前期: {prev.total}件</div>}
        </div>

        {/* 社長接続数＋接続率 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>社長接続数</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'", fontVariantNumeric: 'tabular-nums' }}>
            {cur.ceoConnect}<span style={{ fontSize: 13, fontWeight: 600 }}>件</span>
          </div>
          <div style={{ fontSize: 13, color: '#374151', fontWeight: 700, marginTop: 4 }}>接続率 <span style={{ fontFamily: "'JetBrains Mono'" }}>{connectRate}%</span></div>
          <div style={{ marginTop: 4 }}><GrowthBadge cur={cur.ceoConnect} prev={prev.ceoConnect} /></div>
        </div>

        {/* アポ取得数＋アポ率 */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>アポ取得数</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'", fontVariantNumeric: 'tabular-nums' }}>
            {cur.appo}<span style={{ fontSize: 13, fontWeight: 600 }}>件</span>
          </div>
          <div style={{ fontSize: 13, color: '#374151', fontWeight: 700, marginTop: 4 }}>アポ率 <span style={{ fontFamily: "'JetBrains Mono'" }}>{appoRate}%</span></div>
          <div style={{ marginTop: 4 }}><GrowthBadge cur={cur.appo} prev={prev.appo} /></div>
        </div>
      </div>
    </div>
  );
}
