import { useMemo } from 'react';
import { color, font, radius } from '../../../constants/design';
import { formatCurrency } from '../../../utils/formatters';

const NAVY = '#0D2247';
const STAGE_COLORS = ['#0D2247', '#1E40AF', '#2563EB', '#3B82F6', '#C8A84B', '#C8A84B'];

const MEETING_DONE = new Set(['面談済', '事前確認済', 'アポ取得']);

export default function Funnel({
  stats,          // { calls, keymanConnect, appo }
  appoData = [],
  from,
  to,
  loading = false,
}) {
  const stages = useMemo(() => {
    const calls = stats?.calls || 0;
    const keymanConnect = stats?.keymanConnect || 0;
    const appo = stats?.appo || 0;

    const inRange = (a) => {
      const d = (a.getDate || '').slice(0, 10);
      return (!from || d >= from) && (!to || d <= to);
    };
    const activeAppos = (appoData || []).filter(a => MEETING_DONE.has(a.status) && inRange(a));
    const meetingDone = activeAppos.filter(a => a.status === '面談済' || a.status === '事前確認済').length;
    // 受注・売上は新規開拓由来を除外（件数系の上流ステージは残す）
    const closed = activeAppos.filter(a => !a.isProspecting && (a.sales || 0) > 0).length;
    const sales = activeAppos.reduce((s, a) => s + (a.isProspecting ? 0 : (a.sales || 0)), 0);

    return [
      { label: '架電',       value: calls,        unit: '件', denom: calls },
      { label: 'キーマン接続',   value: keymanConnect,   unit: '件', denom: calls },
      { label: 'アポ獲得',   value: appo,         unit: '件', denom: calls },
      { label: '実施',       value: meetingDone,  unit: '件', denom: appo },
      { label: '受注',       value: closed,       unit: '件', denom: meetingDone },
      { label: '売上',       value: sales,        unit: '¥',  denom: null, isMoney: true },
    ];
  }, [stats, appoData, from, to]);

  const maxVal = stages[0]?.value || 1;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: NAVY, borderBottom: `2px solid ${NAVY}`, paddingBottom: 6, marginBottom: 16, letterSpacing: '0.02em' }}>
        コンバージョンファネル
        <span style={{ fontSize: 10, fontWeight: font.weight.medium, color: color.textLight, marginLeft: 8 }}>
          {from && to ? (from === to ? from : `${from} 〜 ${to}`) : ''}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>読込中…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stages.map((s, i) => {
            const pct = maxVal > 0 ? (s.isMoney ? 100 : (s.value / maxVal) * 100) : 0;
            const conv = (i > 0 && stages[i - 1].value > 0 && !s.isMoney && s.denom != null)
              ? (s.value / s.denom * 100)
              : null;
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 90, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: NAVY, textAlign: 'right' }}>{s.label}</div>
                <div style={{ flex: 1, background: '#F3F4F6', borderRadius: radius.md, overflow: 'hidden', height: 34, position: 'relative' }}>
                  <div style={{ width: pct + '%', height: '100%', background: STAGE_COLORS[i], transition: 'width 0.4s ease', display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                    <span style={{ fontSize: font.size.base, fontWeight: font.weight.black, color: color.white, fontFamily: font.family.mono }}>
                      {s.isMoney ? formatCurrency(s.value) : s.value.toLocaleString() + s.unit}
                    </span>
                  </div>
                </div>
                <div style={{ width: 90, fontSize: 11, color: color.textMid, textAlign: 'left' }}>
                  {conv != null
                    ? <span>前段比 <b style={{ color: NAVY, fontFamily: font.family.mono }}>{conv.toFixed(1)}%</b></span>
                    : <span style={{ color: color.textLight }}>—</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
