import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';

function GrowthBadge({ cur, prev }) {
  if (!prev) return <span style={{ fontSize: 10, color: color.textLight }}>前期比 —</span>;
  const pct = (cur - prev) / prev * 100;
  const up = pct >= 0;
  return (
    <span style={{
      fontSize: font.size.xs,
      fontWeight: font.weight.bold,
      color: up ? color.success : color.danger,
    }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function ActivitySummaryCards({
  aggregated,
  period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
  loading,
}) {
  const cur = { total: aggregated?.current?.total || 0, ceoConnect: aggregated?.current?.ceo_connect || 0, appo: aggregated?.current?.appo || 0 };
  const prev = { total: aggregated?.previous?.total || 0, ceoConnect: aggregated?.previous?.ceo_connect || 0, appo: aggregated?.previous?.appo || 0 };
  const connectRate = cur.total > 0 ? (cur.ceoConnect / cur.total * 100).toFixed(1) : '0.0';
  const appoRate = cur.total > 0 ? (cur.appo / cur.total * 100).toFixed(1) : '0.0';

  const tabBtn = (active) => ({
    padding: '6px 12px',
    fontSize: font.size.xs,
    fontWeight: active ? font.weight.semibold : font.weight.normal,
    cursor: 'pointer',
    background: 'transparent', border: 'none',
    borderBottom: '2px solid ' + (active ? color.navy : 'transparent'),
    color: active ? color.navy : color.gray400,
    borderRadius: 0,
    fontFamily: font.family.sans,
    transition: 'all 0.15s',
  });
  const cardStyle = {
    background: color.white,
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    padding: '20px 22px',
    borderLeft: `2px solid ${color.navy}`,
    flex: 1,
  };

  return (
    <Card padding="none" style={{ marginBottom: 20, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy,
            borderBottom: `2px solid ${color.navy}`, paddingBottom: 8, marginBottom: 12,
          }}>活動サマリー</span>
          {loading && <span style={{ fontSize: 10, color: color.textLight }}>読込中…</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${color.border}` }}>
          {[['day', '日'], ['week', '週'], ['month', '月'], ['custom', '期間指定']].map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} style={tabBtn(period === k)}>{l}</button>
          ))}
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <Input size="sm" type='date' value={customFrom} onChange={e => setCustomFrom(e.target.value)} fullWidth={false} containerStyle={{ width: 'auto' }} />
              <span style={{ fontSize: 10, color: color.textLight }}>〜</span>
              <Input size="sm" type='date' value={customTo} onChange={e => setCustomTo(e.target.value)} fullWidth={false} containerStyle={{ width: 'auto' }} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        {/* 総架電数 */}
        <div style={cardStyle}>
          <div style={{ fontSize: font.size.xs, color: color.gray500, marginBottom: 8 }}>総架電数</div>
          <div style={{
            fontSize: 24, fontWeight: font.weight.black, color: color.navy,
            fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums',
          }}>
            {cur.total}<span style={{ fontSize: font.size.base, fontWeight: font.weight.semibold }}>件</span>
          </div>
          <div style={{ marginTop: 6 }}><GrowthBadge cur={cur.total} prev={prev.total} /></div>
          {prev.total > 0 && <div style={{ fontSize: 10, color: color.textLight, marginTop: 2 }}>前期: {prev.total}件</div>}
        </div>

        {/* 社長接続数＋接続率 */}
        <div style={cardStyle}>
          <div style={{ fontSize: font.size.xs, color: color.gray500, marginBottom: 8 }}>社長接続数</div>
          <div style={{
            fontSize: 24, fontWeight: font.weight.black, color: color.navy,
            fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums',
          }}>
            {cur.ceoConnect}<span style={{ fontSize: font.size.base, fontWeight: font.weight.semibold }}>件</span>
          </div>
          <div style={{
            fontSize: font.size.base, color: color.gray700,
            fontWeight: font.weight.bold, marginTop: 4,
          }}>接続率 <span style={{ fontFamily: font.family.mono }}>{connectRate}%</span></div>
          <div style={{ marginTop: 4 }}><GrowthBadge cur={cur.ceoConnect} prev={prev.ceoConnect} /></div>
        </div>

        {/* アポ取得数＋アポ率 */}
        <div style={cardStyle}>
          <div style={{ fontSize: font.size.xs, color: color.gray500, marginBottom: 8 }}>アポ取得数</div>
          <div style={{
            fontSize: 24, fontWeight: font.weight.black, color: color.navy,
            fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums',
          }}>
            {cur.appo}<span style={{ fontSize: font.size.base, fontWeight: font.weight.semibold }}>件</span>
          </div>
          <div style={{
            fontSize: font.size.base, color: color.gray700,
            fontWeight: font.weight.bold, marginTop: 4,
          }}>アポ率 <span style={{ fontFamily: font.family.mono }}>{appoRate}%</span></div>
          <div style={{ marginTop: 4 }}><GrowthBadge cur={cur.appo} prev={prev.appo} /></div>
        </div>
      </div>
    </Card>
  );
}
