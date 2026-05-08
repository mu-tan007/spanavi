import { useMemo } from 'react';
import { color, space, radius, font, shadow, alpha } from '../../../constants/design';
import { Button, Input, Select, Card, Badge } from '../../ui';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8〜19時

/**
 * heatmapData: [{ dow: 0-6, hour: 0-23, calls: number, connects: number }]
 */
export default function Heatmap({
  heatmapData = [],
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
    (heatmapData || []).forEach(r => {
      if (r.hour < 8 || r.hour > 19) return;
      const key = r.dow + '_' + r.hour;
      if (!g[key]) return;
      g[key].calls = Number(r.calls) || 0;
      g[key].connects = Number(r.connects) || 0;
    });
    return g;
  }, [heatmapData]);

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
    if (cell.calls < 5) return color.gray50;
    const r = cell.connects / cell.calls;
    const norm = Math.min(r / maxRate, 1);
    const a = 0.12 + norm * 0.78;
    return `rgba(13, 34, 71, ${a.toFixed(3)})`;
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
      <div style={{
        fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy,
        borderBottom: `2px solid ${color.navy}`, paddingBottom: 6, marginBottom: 14,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        letterSpacing: '0.02em',
      }}>
        <span>時間帯 × 曜日 ヒートマップ <span style={{ fontSize: 10, fontWeight: font.weight.medium, color: color.textLight, marginLeft: 8 }}>（色=社長接続率）{listName ? ` / ${listName}` : ''}</span></span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: color.textLight, fontSize: font.size.sm }}>読込中…</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              borderCollapse: 'collapse', fontSize: font.size.xs,
              fontFamily: font.family.mono, width: '100%', tableLayout: 'fixed',
            }}>
              <colgroup>
                <col style={{ width: 36 }} />
                {HOURS.map(h => <col key={h} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ padding: '4px 8px', color: color.textLight, fontWeight: font.weight.bold }}></th>
                  {HOURS.map(h => (
                    <th key={h} style={{
                      padding: '4px 6px', color: color.textLight,
                      fontWeight: font.weight.bold, textAlign: 'center',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEKDAYS.map((wd, wi) => (
                  <tr key={wd}>
                    <td style={{
                      padding: '4px 8px', color: color.textMid,
                      fontWeight: font.weight.bold, fontFamily: font.family.sans, textAlign: 'center',
                    }}>{wd}</td>
                    {HOURS.map(h => {
                      const cell = grid[wi + '_' + h];
                      const rate = cell.calls >= 5 ? (cell.connects / cell.calls * 100) : null;
                      const bg = colorFor(cell);
                      const textColor = cell.calls >= 5 && (cell.connects / cell.calls / maxRate) > 0.5 ? color.white : color.gray700;
                      return (
                        <td
                          key={h}
                          title={`${wd} ${h}時台\n架電 ${cell.calls}件 / 社長接続 ${cell.connects}件${rate != null ? ` / ${rate.toFixed(1)}%` : ''}`}
                          style={{
                            padding: '14px 4px', background: bg, textAlign: 'center',
                            border: `2px solid ${color.white}`, color: textColor,
                            fontWeight: rate != null ? font.weight.bold : font.weight.normal, cursor: 'help',
                          }}
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
            <div style={{
              marginTop: 12, padding: '8px 14px',
              background: color.gray50,
              borderLeft: `3px solid ${color.navy}`,
              borderRadius: 2, fontSize: font.size.xs, color: color.textDark,
            }}>
              最も社長接続率が高い時間帯: <b>{WEEKDAYS[bestCell.w]} {bestCell.h}時台</b> ー {bestCell.connects}/{bestCell.calls}件 / <b style={{ color: color.navy }}>{(bestCell.rate * 100).toFixed(1)}%</b>
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 10, color: color.textLight }}>
            ※ 架電5件未満のセルは信頼性の観点から灰色表示（率は計算しない）
          </div>
        </>
      )}
    </section>
  );
}
