import './CRMOverview.css';
import { quickCounts, daysSince, axisX, ageClass } from '../../../utils/crmOverview';

// 顧客管理の上の段（2026-10-07 むー様確認の見本どおり）
//   数字4つ（押すと支援中のその会社だけに絞る） ／ 支援中の会社を「最後のやり取りからの日数」の軸に点で置く
const CNTS = [
  { key: 'stale', cls: 'red', label: '30日以上やり取りなし', desc: '返事を待たずに弊社から' },
  { key: 'pause', cls: 'amb', label: '一時停止（先方都合）', desc: '再開の時期を聞く' },
  { key: 'today', cls: 'blu', label: '今日やり取りした先', desc: null },
  { key: 'norule', cls: 'nav', label: '聞くこと・条件が未設定', desc: 'アポ報告の確認が効かない' },
];
const short = (s = '') => s.replace(/株式会社|有限会社|合同会社|一般社団法人/g, '').trim() || s;

export default function CRMOverview({ clients, today, ruleCount, quick, onQuick, onDot, hoverId }) {
  const counts = quickCounts(clients, today, ruleCount);
  const pts = clients.map(c => ({ c, d: daysSince(c.lastContactAt, today) }));
  const lanes = [36, 54, 72, 92];
  // 14日以内は点だけ（同じ位置は縦に積む）。14日以上は社名を出すので、名前が重ならない段に置く
  const used = {};
  const laneEnd = [-1, -1, -1, -1];
  const AXIS_PX = 1100;
  const place = {};
  [...pts].filter(p => p.d == null || p.d >= 14).sort((a, b) => axisX(a.d) - axisX(b.d)).forEach(p => {
    const x = axisX(p.d);
    const w = ((short(p.c.company).length * 11 + 30) / AXIS_PX) * 100;
    let lane = laneEnd.findIndex(end => end < x - 1);
    if (lane < 0) lane = laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[lane] = x + w;
    place[p.c._supaId] = lanes[lane];
  });
  const near = pts.filter(p => p.d != null && p.d < 14).length;
  const [, m, d] = today.split('-').map(Number);

  return (
    <div className="co">
      <div className="co-cnts">
        {CNTS.map(t => (
          <button key={t.key} type="button" className={`co-card co-cnt ${t.cls}${quick === t.key ? ' is-on' : ''}`} onClick={() => onQuick(quick === t.key ? '' : t.key)}>
            <span><span className="co-t">{t.label}</span><span className="co-d" style={{ display: 'block' }}>{t.desc || `${m}/${d}`}</span></span>
            <b>{counts[t.key]}</b>
          </button>
        ))}
      </div>

      <div className="co-card co-health">
        <div className="co-hh"><b>支援中{clients.length}社 ・ 最後のやり取りからの日数</b><span className="co-lbl">14日以内 {near}社 ・ 点に乗ると社名 ・ 点を押すとその会社の行へ ・ 記録なしは右端</span></div>
        <div className="co-axis">
          <div className="co-zone co-z1" style={{ left: 0, width: `${axisX(14)}%` }} />
          <div className="co-zone co-z2" style={{ left: `${axisX(14)}%`, width: `${axisX(30) - axisX(14)}%` }} />
          <div className="co-zone co-z3" style={{ left: `${axisX(30)}%`, right: 0 }} />
          <span className="co-zt" style={{ left: 8, color: '#0176D3' }}>動いている</span>
          <span className="co-zt" style={{ left: `calc(${axisX(14)}% + 8px)`, color: '#B7791F' }}>気にする</span>
          <span className="co-zt" style={{ left: `calc(${axisX(30)}% + 8px)`, color: '#C8102E' }}>止まっている（30日以上）</span>
          {[0, 7, 14, 30, 60, 90, 120].map(t => <span key={t} className="co-tick" style={{ left: `${axisX(t)}%`, transform: t === 0 ? 'none' : t === 120 ? 'translateX(-100%)' : undefined }}>{t === 0 ? '今日' : t === 120 ? '120日以上' : `${t}日`}</span>)}
          {pts.map(({ c, d: days }, i) => {
            const x = axisX(days);
            let y;
            if (days != null && days < 14) { const k = Math.floor(x / 2.2); used[k] = (used[k] || 0) + 1; y = lanes[(used[k] - 1) % 4]; }
            else y = place[c._supaId];
            const cls = ageClass(days);
            const name = short(c.company);
            return (
              <button key={c._supaId} type="button" className={`co-dot ${cls}${hoverId === c._supaId ? ' is-hl' : ''}`}
                style={{ left: `calc(12px + ${x}% * (1 - 24/100))`, top: y, animationDelay: `${i * 35}ms` }}
                data-t={`${name}：${days == null ? '記録なし' : days === 0 ? '今日' : `${days}日前`}`}
                title={cls === 'ok' ? undefined : `${name}：${days == null ? '記録なし' : `${days}日前`}`}
                onClick={() => onDot(c)}>
                <i />{cls !== 'ok' && <span>{name}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
