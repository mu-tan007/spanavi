import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { color, space, radius, font, alpha } from '../../constants/design';

// つながりやすい時間（2026-10-09 むー様）
// 手で書いた業種の架電ルールの代わりに、全架電の実績から「業種×時間帯のキーマン接続率」を出す。
// リストの会社の業種（上の段）を多い順に最大3つ。率は毎日20時に出し直す（industry_connect_rates）。
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const MIN_CALLS = 150; // これより少ない時間帯は数字を出さない（偶然に振れるため）

// 一番高い時間から、上位の時間帯を「8時台・16〜18時台」の形にまとめる
export function topHours(byHour) {
  const ok = HOURS.filter(h => byHour[h] && byHour[h].calls >= MIN_CALLS);
  return [...ok].sort((a, b) => byHour[b].rate - byHour[a].rate).slice(0, 3).sort((a, b) => a - b);
}
export function bestHoursLabel(byHour) {
  const top = topHours(byHour);
  if (!top.length) return '';
  const runs = [];
  top.forEach(h => { const r = runs[runs.length - 1]; if (r && r[1] === h - 1) r[1] = h; else runs.push([h, h]); });
  return runs.map(([a, b]) => (a === b ? `${a}時台` : `${a}〜${b}時台`)).join('・');
}

export default function IndustryHours({ listSupaId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!listSupaId) return;
    let alive = true;
    (async () => {
      const { data: mix } = await supabase.rpc('list_industry_mix', { p_list_id: listSupaId });
      const total = (mix || []).reduce((s, r) => s + r.n, 0);
      const groups = (mix || []).filter(r => total && r.n / total >= 0.1).slice(0, 3);
      if (!groups.length) { if (alive) setRows([]); return; }
      const { data: rates } = await supabase.from('industry_connect_rates')
        .select('grp, hour, calls, keyman, rate').eq('dow', 0).in('grp', groups.map(g => g.grp));
      const out = groups.map(g => {
        const byHour = {}; let all = null;
        (rates || []).filter(r => r.grp === g.grp).forEach(r => {
          const v = { calls: r.calls, rate: Number(r.rate) };
          if (r.hour === -1) all = v; else byHour[r.hour] = v;
        });
        return { grp: g.grp, share: g.n / total, byHour, all };
      });
      if (alive) setRows(out);
    })();
    return () => { alive = false; };
  }, [listSupaId]);

  if (!rows || !rows.length) return null;
  const max = Math.max(...rows.flatMap(r => HOURS.map(h => (r.byHour[h]?.calls >= MIN_CALLS ? r.byHour[h].rate : 0))), 0.01);
  return (
    <div style={{ padding: `${space[3]}px ${space[4]}px`, borderRadius: radius.md, background: color.offWhite, border: `1px solid ${color.border}`, marginBottom: space[4] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space[2] }}>
        <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.navy }}>つながりやすい時間</span>
        <span style={{ fontSize: font.size.xs - 1, color: color.textLight }}>キーマン接続率・これまでの全架電</span>
      </div>
      {rows.map(r => {
        const best = bestHoursLabel(r.byHour);
        const tops = new Set(topHours(r.byHour));
        return (
          <div key={r.grp} style={{ marginBottom: space[2] }}>
            <div style={{ display: 'flex', gap: space[2], alignItems: 'baseline', fontSize: font.size.xs, marginBottom: 4 }}>
              <span style={{ fontWeight: font.weight.semibold, color: color.textDark }}>{r.grp}</span>
              <span style={{ color: color.textLight }}>リストの{Math.round(r.share * 100)}%</span>
              {r.all && <span style={{ color: color.textMid }}>平均 {(r.all.rate * 100).toFixed(1)}%</span>}
              {best && <span style={{ marginLeft: 'auto', color: color.navy, fontWeight: font.weight.semibold }}>狙い目 {best}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HOURS.length}, 1fr)`, gap: 3, alignItems: 'end', height: 46 }}>
              {HOURS.map(h => {
                const v = r.byHour[h];
                const okv = v && v.calls >= MIN_CALLS;
                const top = tops.has(h);
                return (
                  <div key={h} title={okv ? `${h}時台 ${(v.rate * 100).toFixed(1)}%（${v.calls.toLocaleString()}架電）` : `${h}時台 架電が少ないため出していません`}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: okv ? `${Math.max(6, (v.rate / max) * 30)}px` : 3, background: okv ? (top ? color.navy : alpha(color.navyLight, 0.35)) : color.border }} />
                    <span style={{ fontSize: 9, color: color.textLight, fontFamily: font.family.mono }}>{h}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
