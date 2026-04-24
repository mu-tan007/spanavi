import { useMemo } from 'react';
import { C } from '../../../constants/colors';

const NAVY = '#0D2247';
const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8〜19時

export default function Heatmap({
  callRecords = [],
  ceoConnectLabels,
  loading = false,
  listName = null,
}) {
  const grid = useMemo(() => {
    const g = {};
    for (let w = 0; w < 7; w++) {
      for (const h of HOURS) {
        g[w + '_' + h] = { calls: 0, connects: 0 };
      }
    }
    callRecords.forEach(r => {
      const d = new Date(r.called_at);
      const utcHour = d.getUTCHours();
      const jst = new Date(d.getTime() + 9 * 3600000);
      const hour = jst.getUTCHours();
      const dow = (jst.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
      if (hour < 8 || hour > 19) return;
      const key = dow + '_' + hour;
      if (!g[key]) return;
      g[key].calls++;
      if (ceoConnectLabels?.has(r.status)) g[key].connects++;
      void utcHour;
    });
    return g;
  }, [callRecords, ceoConnectLabels]);

  // 最大接続率を算出してカラースケール正規化
  const maxRate = useMemo(() => {
    let max = 0;
    Object.values(grid).forEach(c => {
      if (c.calls >= 5) {
        const r = c.connects / c.calls;
        if (r > max) max = r;
      }
    });
    return Math.max(max, 0.01);
  }, [grid]);

  const colorFor = (cell) => {
    if (cell.calls < 5) return '#F9FAFB';
    const r = cell.connects / cell.calls;
    const norm = Math.min(r / maxRate, 1);
    const alpha = 0.12 + norm * 0.78;
    return `rgba(13, 34, 71, ${alpha.toFixed(3)})`;
  };

  const bestCell = useMemo(() => {
    let best = null;
    Object.entries(grid).forEach(([key, c]) => {
      if (c.calls < 10) return;
      const rate = c.connects / c.calls;
      if (!best || rate > best.rate) {
        const [w, h] = key.split('_').map(Number);
        best = { w, h, rate, calls: c.calls, connects: c.connects };
      }
    });
    return best;
  }, [grid]);

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, borderBottom: '2px solid ' + NAVY, paddingBottom: 6, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', letterSpacing: '0.02em' }}>
        <span>時間帯 × 曜日 ヒートマップ <span style={{ fontSize: 10, fontWeight: 500, color: C.textLight, marginLeft: 8 }}>（色=社長接続率）{listName ? ` / ${listName}` : ''}</span></span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textLight, fontSize: 12 }}>読込中…</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 10, fontFamily: "'JetBrains Mono'", minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ padding: '4px 8px', color: C.textLight, fontWeight: 700 }}></th>
                  {HOURS.map(h => <th key={h} style={{ padding: '4px 6px', color: C.textLight, fontWeight: 700, textAlign: 'center', minWidth: 40 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {WEEKDAYS.map((wd, wi) => (
                  <tr key={wd}>
                    <td style={{ padding: '4px 8px', color: C.textMid, fontWeight: 700, fontFamily: "'Noto Sans JP'" }}>{wd}</td>
                    {HOURS.map(h => {
                      const cell = grid[wi + '_' + h];
                      const rate = cell.calls >= 5 ? (cell.connects / cell.calls * 100) : null;
                      const bg = colorFor(cell);
                      const textColor = cell.calls >= 5 && (cell.connects / cell.calls / maxRate) > 0.5 ? '#fff' : '#374151';
                      return (
                        <td
                          key={h}
                          title={`${wd} ${h}時台\n架電 ${cell.calls}件 / 社長接続 ${cell.connects}件${rate != null ? ` / ${rate.toFixed(1)}%` : ''}`}
                          style={{ padding: '10px 4px', background: bg, textAlign: 'center', border: '1px solid #fff', color: textColor, fontWeight: rate != null ? 700 : 400, cursor: 'help' }}
                        >
                          {rate != null ? rate.toFixed(0) + '%' : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bestCell && (
            <div style={{ marginTop: 12, padding: '8px 14px', background: '#F9FAFB', borderLeft: '3px solid ' + NAVY, borderRadius: 2, fontSize: 11, color: C.textDark }}>
              最も社長接続率が高い時間帯: <b>{WEEKDAYS[bestCell.w]} {bestCell.h}時台</b> ー {bestCell.connects}/{bestCell.calls}件 / <b style={{ color: NAVY }}>{(bestCell.rate * 100).toFixed(1)}%</b>
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 10, color: C.textLight }}>
            ※ 架電5件未満のセルは信頼性の観点から灰色表示（率は計算しない）
          </div>
        </>
      )}
    </section>
  );
}
