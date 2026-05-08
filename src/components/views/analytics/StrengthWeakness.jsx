import { useMemo } from 'react';
import { color, font, radius } from '../../../constants/design';

const NAVY = '#0D2247';

/**
 * 個人スコープ時に、組織平均との差分を表示するカード。
 * myStats, orgStats: { calls, ceoConnect, appo }
 */
export default function StrengthWeakness({
  memberName,
  myStats,
  orgStats,
}) {
  const comparison = useMemo(() => {
    if (!memberName || !myStats || !orgStats) return null;

    const orgCalls = orgStats.calls || 0;
    const orgCeo = orgStats.ceoConnect || 0;
    const orgAppo = orgStats.appo || 0;
    const orgConnectRate = orgCalls > 0 ? (orgCeo / orgCalls) * 100 : 0;
    const orgAppoRate    = orgCalls > 0 ? (orgAppo / orgCalls) * 100 : 0;
    const orgAppoFromConnect = orgCeo > 0 ? (orgAppo / orgCeo) * 100 : 0;

    const myCalls = myStats.calls || 0;
    const myCeo = myStats.ceoConnect || 0;
    const myAppo = myStats.appo || 0;
    const myConnectRate = myCalls > 0 ? (myCeo / myCalls) * 100 : 0;
    const myAppoRate    = myCalls > 0 ? (myAppo / myCalls) * 100 : 0;
    const myAppoFromConnect = myCeo > 0 ? (myAppo / myCeo) * 100 : 0;

    return [
      { label: '社長接続率',     my: myConnectRate,     org: orgConnectRate,     unit: '%', samples: myCalls },
      { label: 'アポ率（全架電比）', my: myAppoRate,    org: orgAppoRate,        unit: '%', samples: myCalls },
      { label: '接続後アポ転換率', my: myAppoFromConnect, org: orgAppoFromConnect, unit: '%', samples: myCeo },
      { label: '架電数（期間合計）', my: myCalls,       org: orgCalls,           unit: '件', samples: myCalls, noDiff: true },
    ];
  }, [memberName, myStats, orgStats]);

  if (!comparison) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: NAVY, borderBottom: `2px solid ${NAVY}`, paddingBottom: 6, marginBottom: 14 }}>
        {memberName} の強み/弱み <span style={{ fontSize: 10, fontWeight: font.weight.medium, color: color.textLight, marginLeft: 8 }}>組織平均との差分</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {comparison.map(m => {
          const diff = m.my - m.org;
          const isStrength = !m.noDiff && diff > 0;
          const isWeakness = !m.noDiff && diff < 0;
          const lowSample = m.samples < 20;
          const clr = lowSample ? color.textLight : (isStrength ? '#16a34a' : isWeakness ? '#dc2626' : color.textMid);
          const badge = lowSample ? '参考' : (isStrength ? '強み' : isWeakness ? '弱み' : '—');
          const badgeBg = lowSample ? '#F3F4F6' : (isStrength ? '#DCFCE7' : isWeakness ? '#FEE2E2' : '#F3F4F6');

          return (
            <div key={m.label} style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: font.weight.bold, color: color.textMid, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{m.label}</div>
                {!m.noDiff && (
                  <span style={{ fontSize: 9, fontWeight: font.weight.bold, color: clr, background: badgeBg, padding: '2px 6px', borderRadius: 2 }}>{badge}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: NAVY, fontFamily: font.family.mono, fontVariantNumeric: 'tabular-nums' }}>
                  {m.unit === '%' ? m.my.toFixed(1) : Math.round(m.my).toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: color.textMid }}>{m.unit}</div>
              </div>
              {!m.noDiff && (
                <div style={{ marginTop: 6, fontSize: 10, color: color.textMid }}>
                  組織平均: <b style={{ fontFamily: font.family.mono }}>{m.unit === '%' ? m.org.toFixed(1) : Math.round(m.org).toLocaleString()}{m.unit}</b>{' '}
                  <span style={{ color: clr, fontWeight: font.weight.bold }}>
                    ({diff >= 0 ? '+' : ''}{m.unit === '%' ? diff.toFixed(1) + 'pt' : Math.round(diff).toLocaleString() + m.unit})
                  </span>
                  {lowSample && <span style={{ color: color.textLight, marginLeft: 6 }}>※ サンプル少</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
