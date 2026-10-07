import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { color, radius, font, alpha } from '../../constants/design';

// 架電ページの「この会社の受付」（2026-10-07 むー様決定）。
// 同じ会社（法人番号、無ければ電話番号）の受付の対応を、リストをまたいで新しい順に出す。声紋は使わない。
const OUT = {
  connected: ['取り次ぎ', color.success],
  return_time: ['戻り時間を教えてくれた', color.navyLight],
  absent: ['不在', color.textMid],
  blocked: ['受付で止められた', color.danger],
  unknown: ['不明', color.textLight],
};
const TONE = { soft: '丁寧', neutral: '', curt: 'ぶっきらぼう' };

export default function ReceptionHistory({ itemId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!itemId) { setRows([]); return undefined; }
    let alive = true;
    supabase.rpc('company_reception_history', { p_item_id: itemId, p_limit: 12 }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.warn('[ReceptionHistory]', error.message); setRows([]); return; }
      setRows(data || []);
    });
    return () => { alive = false; };
  }, [itemId]);
  if (!rows || rows.length === 0) return null;

  const count = k => rows.filter(r => r.reception?.outcome === k).length;
  const names = [...new Set(rows.map(r => r.reception?.receptionist_name).filter(Boolean))];
  const lastHint = rows.find(r => r.reception?.return_hint)?.reception?.return_hint;
  const lists = new Set(rows.map(r => `${r.client_name}${r.list_label}`));
  const d = s => { const t = new Date(s); return `${t.getMonth() + 1}/${t.getDate()}`; };

  return (
    <div style={{ background: color.white, border: '1px solid #E3E6EB', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: '.14em', fontWeight: 600, color: '#4B5868' }}>この会社の受付</span>
        <span style={{ fontSize: 10, color: color.textLight }}>{rows.length}回の記録{lists.size > 1 ? `（${lists.size}つのリストから）` : ''}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6, fontSize: 11 }}>
        {['connected', 'return_time', 'absent', 'blocked'].map(k => count(k) > 0 && (
          <span key={k} style={{ padding: '1px 8px', borderRadius: 999, background: alpha(OUT[k][1], 0.1), color: OUT[k][1], fontWeight: font.weight.semibold }}>{OUT[k][0]} {count(k)}</span>
        ))}
        {names.length > 0 && <span style={{ color: color.textMid }}>名乗った受付：{names.join('・')}</span>}
      </div>
      {lastHint && <div style={{ fontSize: 11, color: color.navy, marginBottom: 6 }}>前に聞けた戻りの目安：「{lastHint}」</div>}
      <div style={{ display: 'grid', gap: 3 }}>
        {rows.slice(0, 6).map((r, i) => {
          const o = OUT[r.reception?.outcome] || OUT.unknown;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 120px 1fr', gap: 6, fontSize: 11, alignItems: 'baseline' }}>
              <span style={{ color: color.textLight }}>{d(r.called_at)}</span>
              <span style={{ color: o[1], fontWeight: font.weight.semibold }}>{o[0]}{TONE[r.reception?.tone] ? `・${TONE[r.reception.tone]}` : ''}</span>
              <span style={{ color: color.textMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reception?.note || ''}{r.getter_name ? `（${r.getter_name.split(/\s/)[0]}）` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
