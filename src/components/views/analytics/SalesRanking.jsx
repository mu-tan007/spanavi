import React, { useMemo } from 'react';
import { color, space, radius, font, alpha, shadow } from '../../../constants/design';
import { isSalesAppo } from './salesPeriod';

// 個人別 当社売上ランキング（面談実施日ベース・アポ一覧と一致）。
// Spanaviのデザイン規約（navy/gold トークン、絵文字なし、金融プロフェッショナル感）に沿う。
export default function SalesRanking({ appoData, range, period, monthStr, teamMap = {} }) {
  const rows = useMemo(() => {
    const map = new Map();
    (appoData || []).forEach(a => {
      if (!isSalesAppo(a, period, range, monthStr)) return;
      const name = a.getter || '—';
      if (!map.has(name)) map.set(name, { name, sales: 0, appo: 0 });
      const o = map.get(name);
      o.sales += Number(a.sales || 0);
      o.appo += 1;
    });
    return [...map.values()]
      .filter(r => r.sales > 0)
      .sort((a, b) => b.sales - a.sales)
      .map((r, i) => ({ ...r, rank: i + 1, team: teamMap[r.name] || '' }));
  }, [appoData, range, period, monthStr, teamMap]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.sales, 0), [rows]);
  const max = rows[0]?.sales || 1;

  // 上位3名の順位バッジ色（金/銀/銅 相当だが Spanavi トーン: 金=gold, 2-3位=navy系）
  const rankColor = (rank) => rank === 1 ? color.gold : (rank <= 3 ? color.navyLight : color.gray300);

  return (
    <div style={{ marginBottom: space[5] }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space[2] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.navy, borderLeft: `3px solid ${color.gold}`, paddingLeft: 8 }}>
          個人別 売上ランキング
        </div>
        <div style={{ fontSize: font.size.xs, color: color.textLight }}>
          合計 <b style={{ color: color.navy, fontFamily: font.family.mono }}>¥{total.toLocaleString()}</b>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
        {rows.length === 0 && (
          <div style={{ padding: '18px 6px', textAlign: 'center', color: color.textLight, fontSize: font.size.sm, background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md }}>
            この期間の売上がありません
          </div>
        )}
        {rows.map(r => {
          const pct = (r.sales / max) * 100;
          const top = r.rank <= 3;
          return (
            <div key={r.name}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: space[3],
                padding: '10px 14px', background: color.white,
                border: `1px solid ${top ? alpha(color.gold, 0.4) : color.border}`,
                borderRadius: radius.md, overflow: 'hidden',
                boxShadow: top ? shadow.xs : 'none',
              }}>
              {/* 売上比率の薄いバー（背景） */}
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`,
                background: alpha(top ? color.gold : color.navyLight, 0.06), pointerEvents: 'none' }} />
              {/* 順位バッジ */}
              <div style={{
                position: 'relative', flexShrink: 0, width: 28, height: 28, borderRadius: radius.pill,
                background: rankColor(r.rank), color: r.rank <= 3 ? color.white : color.textMid,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: font.size.sm, fontWeight: font.weight.bold, fontFamily: font.family.mono,
              }}>{r.rank}</div>
              {/* 名前 + チーム */}
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name}
                </div>
                {r.team && <div style={{ fontSize: font.size.xs - 1, color: color.textLight }}>{r.team}</div>}
              </div>
              {/* アポ件数 */}
              <div style={{ position: 'relative', flexShrink: 0, fontSize: font.size.xs, color: color.textMid, textAlign: 'right' }}>
                {r.appo}<span style={{ color: color.textLight, marginLeft: 1 }}>件</span>
              </div>
              {/* 売上 */}
              <div style={{ position: 'relative', flexShrink: 0, minWidth: 110, textAlign: 'right',
                fontFamily: font.family.mono, fontSize: font.size.md, fontWeight: font.weight.bold,
                color: top ? color.navy : color.textDark }}>
                ¥{r.sales.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: font.size.xs - 1, color: color.textLight, marginTop: 8 }}>
        面談実施日ベース。面談済/事前確認済/アポ取得が対象（リスケ・キャンセル・クライアント開拓は除外）。
      </div>
    </div>
  );
}
