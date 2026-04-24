import { useMemo } from 'react';
import { C } from '../../../constants/colors';
import { formatCurrency } from '../../../utils/formatters';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const STAGE_COLORS = ['#0D2247', '#1E40AF', '#2563EB', '#3B82F6', '#C8A84B', '#C8A84B'];

const MEETING_DONE = new Set(['面談済', '事前確認済', 'アポ取得']);

export default function Funnel({
  callRecords = [],
  appoData = [],
  ceoConnectLabels,
  from,
  to,
  loading = false,
}) {
  const stages = useMemo(() => {
    const calls = callRecords.length;
    const ceoConnect = callRecords.filter(r => ceoConnectLabels?.has(r.status)).length;
    const appo = callRecords.filter(r => r.status === 'アポ獲得').length;

    const inRange = (a) => {
      const d = (a.getDate || '').slice(0, 10);
      return (!from || d >= from) && (!to || d <= to);
    };
    const activeAppos = (appoData || []).filter(a => MEETING_DONE.has(a.status) && inRange(a));
    const meetingDone = activeAppos.filter(a => a.status === '面談済' || a.status === '事前確認済').length;
    const closed = activeAppos.filter(a => (a.sales || 0) > 0).length;
    const sales = activeAppos.reduce((s, a) => s + (a.sales || 0), 0);

    return [
      { label: '架電',       value: calls,        unit: '件', denom: calls },
      { label: '社長接続',   value: ceoConnect,   unit: '件', denom: calls },
      { label: 'アポ獲得',   value: appo,         unit: '件', denom: calls },
      { label: '実施',       value: meetingDone,  unit: '件', denom: appo },
      { label: '受注',       value: closed,       unit: '件', denom: meetingDone },
      { label: '売上',       value: sales,        unit: '¥',  denom: null, isMoney: true },
    ];
  }, [callRecords, appoData, ceoConnectLabels, from, to]);

  const maxVal = stages[0]?.value || 1;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 16, letterSpacing: '0.02em' }}>
        コンバージョンファネル
        <span style={{ fontSize: 10, fontWeight: 500, color: C.textLight, marginLeft: 8 }}>
          {from && to ? (from === to ? from : `${from} 〜 ${to}`) : ''}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 12 }}>読込中…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stages.map((s, i) => {
            const pct = maxVal > 0 ? (s.isMoney ? 100 : (s.value / maxVal) * 100) : 0;
            const conv = (i > 0 && stages[i - 1].value > 0 && !s.isMoney && s.denom != null)
              ? (s.value / s.denom * 100)
              : null;
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 90, fontSize: 12, fontWeight: 600, color: NAVY, textAlign: 'right' }}>{s.label}</div>
                <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden', height: 34, position: 'relative' }}>
                  <div style={{ width: pct + '%', height: '100%', background: STAGE_COLORS[i], transition: 'width 0.4s ease', display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono'" }}>
                      {s.isMoney ? formatCurrency(s.value) : s.value.toLocaleString() + s.unit}
                    </span>
                  </div>
                </div>
                <div style={{ width: 90, fontSize: 11, color: C.textMid, textAlign: 'left' }}>
                  {conv != null
                    ? <span>前段比 <b style={{ color: NAVY, fontFamily: "'JetBrains Mono'" }}>{conv.toFixed(1)}%</b></span>
                    : <span style={{ color: C.textLight }}>—</span>
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
