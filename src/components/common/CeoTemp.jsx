import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { color, radius, font, alpha } from '../../constants/design';

// 架電ページの「社長の温度感」（2026-10-09 むー様が断り方ごとに 高・中・低・除外 を決めた）
// キーマン断りのたびにAIが断り方と根拠の発言を選び、温度感は一覧から決める（除外が最優先・それ以外は一番高いもの）。
// 同じ会社の最新の判定（リストをまたいで）。除外はずっと残す。最新が高でなく、180日以内に高があれば添える。
const POS = { 高: 82, 中: 50, 低: 16, 除外: 3 };
const LV_COLOR = { 高: color.gold, 中: color.navyLight, 低: color.textMid, 除外: color.danger };
const md = s => { const t = new Date(s); return `${t.getMonth() + 1}/${t.getDate()}`; };
const short = s => (s || '').replace(/株式会社|有限会社/g, '').trim();

export default function CeoTemp({ itemId }) {
  const [t, setT] = useState(null);
  useEffect(() => {
    if (!itemId) { setT(null); return undefined; }
    let alive = true;
    supabase.rpc('company_ceo_temp', { p_item_id: itemId }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.warn('[CeoTemp]', error.message); setT(null); return; }
      setT((data && data[0]) || null);
    });
    return () => { alive = false; };
  }, [itemId]);
  if (!t || !t.level) return null;
  const src = [md(t.called_at), short(t.client_name), (t.getter_name || '').split(/\s/)[0]].filter(Boolean).join('・');
  const said = t.quote || (t.reasons || []).join('・');
  return (
    <div style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.xl, padding: '10px 14px', marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr 30px', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>社長の温度感</span>
        <div style={{ height: 8, borderRadius: 4, position: 'relative', background: t.level === '除外' ? alpha(color.danger, 0.25) : `linear-gradient(90deg, ${alpha(color.navyLight, 0.35)}, ${color.navyLight} 50%, ${color.gold})` }}>
          <i style={{ position: 'absolute', top: -4, left: `${POS[t.level]}%`, width: 4, height: 16, borderRadius: 999, background: color.navyDeep }} />
        </div>
        <b style={{ fontSize: font.size.sm, color: LV_COLOR[t.level], textAlign: 'right' }}>{t.level}</b>
      </div>
      <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 4, marginLeft: 94, lineHeight: 1.6 }}>
        {said && <>「{said}」</>}<span style={{ color: color.textLight, marginLeft: 6 }}>{src}</span>
        {t.past_high_quote && (
          <div style={{ color: color.gold }}>過去に高：「{t.past_high_quote}」<span style={{ color: color.textLight, marginLeft: 6 }}>{[md(t.past_high_at), short(t.past_high_client)].filter(Boolean).join('・')}</span></div>
        )}
      </div>
    </div>
  );
}
