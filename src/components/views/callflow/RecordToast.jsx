import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { deleteCallRecord, updateCallListItem } from '../../../lib/supabaseWrite';
import './CallPage.css';

// 記録の知らせ（2026-10-09 むー様・見本 call.html）
// 結果を押すと下に「〇〇 ・ 3回目『不通』を記録」と5秒出し、「取り消す」でその記録を消して会社の状態を元に戻す。
// 架電ページは結果のあとに次の会社へ移るので、知らせは架電ページの外（SpanaviApp）で持つ
export default function RecordToast() {
  const [t, setT] = useState(null);
  const [msg, setMsg] = useState('');
  const timer = useRef(null);
  useEffect(() => {
    const f = e => {
      setMsg(''); setT({ ...e.detail, k: Date.now() });
      clearTimeout(timer.current); timer.current = setTimeout(() => setT(null), 5000);
    };
    window.addEventListener('spanavi:recorded', f);
    return () => window.removeEventListener('spanavi:recorded', f);
  }, []);
  const undo = async () => {
    if (!t) return;
    clearTimeout(timer.current);
    const err = await deleteCallRecord(t.recId);
    if (err) { setMsg('取り消せませんでした'); timer.current = setTimeout(() => setT(null), 3000); return; }
    // 残った記録の最新の結果に戻す（記録が無ければ記録前の状態）
    const { data } = await supabase.from('call_records').select('status').eq('item_id', t.itemId).order('called_at', { ascending: false }).limit(1);
    const st = data?.[0]?.status || t.prevStatus || '未架電';
    await updateCallListItem(t.itemId, { call_status: st, is_excluded: t.prevExcluded });
    setMsg(`取り消しました（${st}に戻しました）。前へで戻ってかけ直せます`);
    timer.current = setTimeout(() => setT(null), 3500);
  };
  const short = String(t?.company || '').replace(/株式会社|有限会社|合同会社|（株）|\(株\)/g, '').trim();
  return (
    <div className="cfv" style={{ position: 'static' }}>
      <div key={t?.k} className={`toast ${t ? 'on' : ''}`} style={{ zIndex: 20050 }}>
        <span>{msg || (t ? `${short} ・ ${t.round}回目「${t.status}」${t.when ? `（${t.when}）` : ''}を記録` : '')}</span>
        {t && !msg && <button onClick={undo}>取り消す</button>}
        {t && !msg && <svg className="cd" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" /></svg>}
      </div>
    </div>
  );
}
