import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { color, radius, font, alpha } from '../../constants/design';

// 架電ページの「受付の温度感」（2026-10-09 むー様）
// 高：社長につないでくれた・戻り時間を教えてくれた ／ 中：不在で戻り時間も分からない ／ 低：営業お断り・一切結構
// 同じ会社の最新の架電から（リストをまたいで）。根拠の一言と、いつ・どのクライアントの話かを添える。
const POS = { 高: 82, 中: 50, 低: 16 };
const LV_COLOR = { 高: color.gold, 中: color.navyLight, 低: color.textMid };

export default function ReceptionTemp({ itemId }) {
  const [t, setT] = useState(null);
  useEffect(() => {
    if (!itemId) { setT(null); return undefined; }
    let alive = true;
    supabase.rpc('company_reception_temp', { p_item_id: itemId }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.warn('[ReceptionTemp]', error.message); setT(null); return; }
      setT((data && data[0]) || null);
    });
    return () => { alive = false; };
  }, [itemId]);
  if (!t || !t.level) return null;
  const d = new Date(t.called_at);
  const src = [`${d.getMonth() + 1}/${d.getDate()}`, t.client_name ? `${t.client_name.replace(/株式会社|有限会社/g, '').trim()}様` : '', t.getter_name ? `${t.getter_name.split(/\s/)[0]}さん` : ''].filter(Boolean).join('・');
  return (
    <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.xl, padding: '10px 14px', marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr 22px', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>受付の温度感</span>
        <div style={{ height: 8, borderRadius: 4, position: 'relative', background: `linear-gradient(90deg, ${alpha(color.navyLight, 0.35)}, ${color.navyLight} 50%, ${color.gold})` }}>
          <i style={{ position: 'absolute', top: -4, left: `${POS[t.level]}%`, width: 4, height: 16, borderRadius: 999, background: color.navyDeep }} />
        </div>
        <b style={{ fontSize: font.size.sm, color: LV_COLOR[t.level], textAlign: 'right' }}>{t.level}</b>
      </div>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 4, marginLeft: 94, lineHeight: 1.6 }}>
        「{t.evidence}」<span style={{ color: color.textLight, marginLeft: 6 }}>{src}</span>
      </div>
    </div>
  );
}
