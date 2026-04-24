import { useMemo } from 'react';
import { C } from '../../../constants/colors';

const NAVY = '#0D2247';

/**
 * 個人スコープ時に、組織平均との差分を表示するカード
 */
export default function StrengthWeakness({
  memberName,
  allCallRecords,        // 組織全体のレコード
  memberCallRecords,     // 個人のレコード
  ceoConnectLabels,
}) {
  const comparison = useMemo(() => {
    if (!memberName) return null;

    const orgCalls = allCallRecords.length;
    const orgCeo   = allCallRecords.filter(r => ceoConnectLabels?.has(r.status)).length;
    const orgAppo  = allCallRecords.filter(r => r.status === 'アポ獲得').length;
    const orgConnectRate = orgCalls > 0 ? (orgCeo / orgCalls) * 100 : 0;
    const orgAppoRate    = orgCalls > 0 ? (orgAppo / orgCalls) * 100 : 0;
    const orgAppoFromConnect = orgCeo > 0 ? (orgAppo / orgCeo) * 100 : 0;

    const myCalls = memberCallRecords.length;
    const myCeo   = memberCallRecords.filter(r => ceoConnectLabels?.has(r.status)).length;
    const myAppo  = memberCallRecords.filter(r => r.status === 'アポ獲得').length;
    const myConnectRate = myCalls > 0 ? (myCeo / myCalls) * 100 : 0;
    const myAppoRate    = myCalls > 0 ? (myAppo / myCalls) * 100 : 0;
    const myAppoFromConnect = myCeo > 0 ? (myAppo / myCeo) * 100 : 0;

    return [
      { label: '社長接続率',  my: myConnectRate,      org: orgConnectRate,      unit: '%', samples: myCalls },
      { label: 'アポ率（全架電比）', my: myAppoRate, org: orgAppoRate,         unit: '%', samples: myCalls },
      { label: '接続後アポ転換率', my: myAppoFromConnect, org: orgAppoFromConnect, unit: '%', samples: myCeo },
      { label: '架電数（期間合計）', my: myCalls, org: orgCalls / Math.max(1, 1), unit: '件', samples: myCalls, noDiff: true },
    ];
  }, [memberName, allCallRecords, memberCallRecords, ceoConnectLabels]);

  if (!comparison) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 14 }}>
        {memberName} の強み/弱み <span style={{ fontSize: 10, fontWeight: 500, color: C.textLight, marginLeft: 8 }}>組織平均との差分</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {comparison.map(m => {
          const diff = m.my - m.org;
          const pct = m.org > 0 ? (diff / m.org) * 100 : 0;
          const isStrength = !m.noDiff && diff > 0;
          const isWeakness = !m.noDiff && diff < 0;
          const lowSample = m.samples < 20;
          const color = lowSample ? C.textLight : (isStrength ? '#16a34a' : isWeakness ? '#dc2626' : C.textMid);
          const badge = lowSample ? '参考' : (isStrength ? '強み' : isWeakness ? '弱み' : '—');
          const badgeBg = lowSample ? '#F3F4F6' : (isStrength ? '#DCFCE7' : isWeakness ? '#FEE2E2' : '#F3F4F6');

          return (
            <div key={m.label} style={{ background: '#fff', border: '1px solid ' + C.border, borderRadius: 4, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMid, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{m.label}</div>
                {!m.noDiff && (
                  <span style={{ fontSize: 9, fontWeight: 700, color, background: badgeBg, padding: '2px 6px', borderRadius: 2 }}>{badge}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: NAVY, fontFamily: "'JetBrains Mono'", fontVariantNumeric: 'tabular-nums' }}>
                  {m.unit === '%' ? m.my.toFixed(1) : Math.round(m.my).toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: C.textMid }}>{m.unit}</div>
              </div>
              {!m.noDiff && (
                <div style={{ marginTop: 6, fontSize: 10, color: C.textMid }}>
                  組織平均: <b style={{ fontFamily: "'JetBrains Mono'" }}>{m.unit === '%' ? m.org.toFixed(1) : Math.round(m.org).toLocaleString()}{m.unit}</b>{' '}
                  <span style={{ color, fontWeight: 700 }}>
                    ({diff >= 0 ? '+' : ''}{m.unit === '%' ? diff.toFixed(1) + 'pt' : Math.round(diff).toLocaleString() + m.unit})
                  </span>
                  {lowSample && <span style={{ color: C.textLight, marginLeft: 6 }}>※ サンプル少</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
