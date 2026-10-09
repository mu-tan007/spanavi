import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// 温度感（2026-10-09 むー様・見本 call.html）：受付（上）と社長（下）の2本。根拠の発言と、いつ・どのクライアントの話か（リストをまたいで最新）
const POS = { 高: 82, 中: 50, 低: 16, 除外: 3 };
const CL = { 高: 'hi', 中: 'mid', 低: 'lo', 除外: 'lo' };
const md = s => { const t = new Date(s); return `${t.getMonth() + 1}/${t.getDate()}`; };
const short = s => (s || '').replace(/株式会社|有限会社/g, '').trim();
const src = t => [md(t.called_at), short(t.client_name), (t.getter_name || '').split(/\s/)[0]].filter(Boolean).join('・');

export default function TempsBox({ itemId }) {
  const [rec, setRec] = useState(null);
  const [ceo, setCeo] = useState(null);
  useEffect(() => {
    setRec(null); setCeo(null);
    if (!itemId) return undefined;
    let alive = true;
    supabase.rpc('company_reception_temp', { p_item_id: itemId }).then(({ data }) => { if (alive) setRec((data && data[0]) || null); });
    supabase.rpc('company_ceo_temp', { p_item_id: itemId }).then(({ data }) => { if (alive) setCeo((data && data[0]) || null); });
    return () => { alive = false; };
  }, [itemId]);
  const row = (who, t, said, none) => (
    <div className="tg" key={who}>
      <div className="row"><span className="who">{who}</span>
        <div className={`m ${t?.level ? '' : 'na'}`}>{t?.level && <i style={{ left: `${POS[t.level]}%` }} />}</div>
        <b className={`lv ${t?.level ? CL[t.level] : 'na'}`}>{t?.level || '―'}</b></div>
      <div className="tx">{t?.level ? <>{said ? `「${said}」` : ''}<small>{src(t)}</small></> : none}</div>
      {who === '社長' && t?.past_high_quote && <div className="tx" style={{ color: '#8A6A24' }}>過去に高：「{t.past_high_quote}」<small>{[md(t.past_high_at), short(t.past_high_client)].filter(Boolean).join('・')}</small></div>}
    </div>
  );
  return (
    <div>
      {row('受付', rec, rec?.evidence, 'まだ受付と話していない')}
      {row('社長', ceo, ceo?.quote || (ceo?.reasons || []).join('・'), 'まだ社長と話していない')}
    </div>
  );
}
