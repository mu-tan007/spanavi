import './ShiftOverlays.css';
import { weekOf, daySummary } from '../../../utils/shiftInsights';

// シフトの線表に重ねるもの（2026-10-07 むー様確認の見本どおり）
// 線表の時間軸（8:00〜22:00）と同じ割合で置く。
const TL_START = 480, TL_TOTAL = 840;
const pct = (min) => ((min - TL_START) / TL_TOTAL) * 100;

/** 週の6枚（月〜土）：人数・時間・時間ごとの人数の小さな棒。押すとその日の線表へ */
export function ShiftWeekStrip({ shifts, selectedDate, todayDate, onPick }) {
  const days = weekOf(selectedDate);
  return (
    <div className="sw-week">
      {days.map((d, i) => {
        const sum = daySummary(shifts, d.date);
        const loaded = shifts.some(s => s.shift_date.slice(0, 7) === d.date.slice(0, 7));
        const bars = Array.from({ length: 11 }, (_, k) => {
          const from = (8 + k) * 60, to = from + 60;
          return new Set(shifts.filter(s => s.shift_date === d.date && toMin(s.start_time) < to && toMin(s.end_time) > from).map(s => s.member_id)).size;
        });
        return (
          <button key={d.date} type="button" className={`sw-wd${d.date === selectedDate ? ' is-on' : ''}${d.dow === '土' ? ' sat' : ''}`} onClick={() => onPick(d.date)}>
            <span className="sw-h"><span>{d.m}/{d.d}（{d.dow}）{d.date === todayDate ? ' 今日' : ''}</span><span className="sw-num">{loaded ? `${sum.hours.toFixed(1)}h` : ''}</span></span>
            <span className="sw-v sw-num">{loaded ? sum.people : '—'}<small>名</small></span>
            <span className="sw-mini">{bars.map((b, k) => <i key={k} style={{ height: `${Math.max(4, (b / 8) * 100)}%`, animationDelay: `${(i * 11 + k) * 12}ms` }} />)}</span>
          </button>
        );
      })}
    </div>
  );
}

const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

/** 線表の上の2段：社長につながる割合（直近60日）と、その時間に入っている人数 */
export function ShiftHeatRows({ rates, heads, gaps, NAME_W, TOTAL_W }) {
  const hours = Array.from({ length: 14 }, (_, i) => 8 + i);
  const rateColor = (v) => `rgba(200,164,90,${Math.min(1, Math.max(0, (v - 5) / 4.5)) * 0.85 + 0.15})`;
  return (
    <div className="sw-heat">
      <div className="sw-row">
        <div className="sw-lab" style={{ width: NAME_W }}>社長につながる割合</div>
        <div className="sw-track">
          {hours.map((h, k) => {
            const r = rates[h];
            if (!r) return null;
            return <span key={h} className="sw-hc" title={`${h}時台 ${r.calls.toLocaleString()}件中 ${r.rate}%（直近60日・平日）`}
              style={{ left: `calc(${pct(h * 60)}% + 2px)`, width: `calc(${(60 / TL_TOTAL) * 100}% - 4px)`, background: rateColor(r.rate), opacity: r.calls < 1000 ? 0.5 : 1, animationDelay: `${k * 30}ms` }}>{r.rate.toFixed(1)}%</span>;
          })}
        </div>
        <div style={{ width: TOTAL_W + 8, flexShrink: 0 }} />
      </div>
      <div className="sw-row">
        <div className="sw-lab" style={{ width: NAME_W }}>入っている人数</div>
        <div className="sw-track">
          {hours.slice(0, 12).map(h => (
            <span key={h} className={`sw-cnt${(heads[h] ?? 0) <= 2 ? ' low' : ''}`} style={{ left: `${pct(h * 60)}%`, width: `${(60 / TL_TOTAL) * 100}%` }}>{heads[h] ?? 0}人</span>
          ))}
          {gaps.map(h => <span key={`g${h}`} className="sw-gap" style={{ left: `${pct(h * 60)}%`, width: `${(60 / TL_TOTAL) * 100}%` }} />)}
        </div>
        <div style={{ width: TOTAL_W + 8, flexShrink: 0 }} />
      </div>
    </div>
  );
}

/** その日の気づき（つながりやすいのに人が少ない時間・シフトの外の架電） */
export function ShiftDayNotes({ gaps, rates, heads, outside, totalCalls }) {
  const items = [];
  if (gaps.length) {
    const g = gaps.map(h => `${h}時台（${rates[h].rate}%・${heads[h] ?? 0}人）`).join('、');
    items.push({ cls: 'gold', head: 'つながりやすいのに人が少ない時間', body: `${g}。ここに人を寄せると、同じ架電数でも話せる社長が増える` });
  }
  const names = Object.entries(outside);
  if (names.length) {
    const t = names.map(([n, o]) => `${n.split(/\s/)[0]} ${o.hours.map(h => `${h}時`).join('・')}台 ${o.calls}件`).join('、');
    items.push({ cls: 'blue', head: `シフトの外の架電 ${names.length}名`, body: `${t}。シフトの入れ忘れなら直す（報酬の計算に使うため）` });
  }
  if (!items.length) items.push({ cls: 'gray', head: '気になる点はありません', body: totalCalls ? `この日の架電 ${totalCalls.toLocaleString()}件はすべてシフトの中です` : 'この日の架電はまだありません' });
  return (
    <div className="sw-notes">
      {items.map((it, i) => <div key={i} className={`sw-note ${it.cls}`}><b>{it.head}</b><span>{it.body}</span></div>)}
      <div className="sw-note gray"><span>社長につながる割合は、直近60日・平日の全架電から。件数の少ない時間（1,000件未満）は薄く出しています</span></div>
    </div>
  );
}
