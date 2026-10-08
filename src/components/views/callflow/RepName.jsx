import { useEffect, useState } from 'react';
import { color, font, radius, space } from '../../../constants/design';
import { supabase } from '../../../lib/supabase';

/**
 * 社長の名前と、その上の小さなふりがな（2026-10-08 むー様）。
 * ふりがなは AI の推定（representative_kana_source='ai'）なら「推定」と出す。
 * 電話で正しい読みを聞いたら「読みを直す」で直せる。直した読みは、同じ法人番号の会社（別のリスト）にも入る。
 * 受付で「社長は退任済み」と言われた時だけ「社長名を調べる」を押す。会社HPから今の社長名を取り、
 * リストの名前と違えば、今の社長名（とふりがな）を出し、リストの名前は小さく打ち消して残す。
 */
export default function RepName({ row, compact = false }) {
  const [kana, setKana] = useState(row?.representative_kana && row.representative_kana !== '-' ? row.representative_kana : '');
  const [source, setSource] = useState(row?.representative_kana_source || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // 社長名を国の法人情報（gBizINFO）で確かめる。180日以内に確かめていれば、前の結果をそのまま使う
  const [current, setCurrent] = useState(row?.representative_current || '');
  useEffect(() => {
    if (compact || !row?.id || !row?.corporate_number) return;
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-representative`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({ item_id: row.id }),
        });
        const j = await res.json().catch(() => ({}));
        if (alive && 'current' in j) setCurrent(j.current || '');
      } catch { /* 確かめられなくても名前はそのまま出す */ }
    })();
    return () => { alive = false; };
  }, [row?.id, compact]);
  const [looking, setLooking] = useState(false);
  const [lookMsg, setLookMsg] = useState('');
  if (!row?.representative) return null;

  const lookup = async () => {
    setLooking(true); setLookMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/find-representative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || ''}` },
        // 裏で最後まで調べる。押したらすぐ次の会社へ移って大丈夫（結果は次にこの会社を開いた時に出る）
        body: JSON.stringify({ item_id: row.id, background: true }),
      });
      await res.json().catch(() => ({}));
      setLookMsg('調べています（10秒ほど）。次の会社へ移って大丈夫です');
      // この画面に居続けた時だけ、少し待って結果を出す
      await new Promise(r => setTimeout(r, 12000));
      const { data: fresh } = await supabase.from('call_list_items').select('representative_current, representative_kana, representative_source').eq('id', row.id).maybeSingle();
      const j = { current: fresh?.representative_current || '', kana: fresh?.representative_kana || '', same: fresh?.representative_source && !fresh?.representative_current && !/no_name|not_found/.test(fresh.representative_source), reason: /no_name|not_found/.test(fresh?.representative_source || '') ? '会社HPとウェブ検索で、社長名が見つかりませんでした' : '' };
      if (j.current) { setCurrent(j.current); if (j.kana) { setKana(j.kana); setSource('ai'); } setLookMsg('会社HPで今の社長名が分かりました'); }
      else if (j.same) setLookMsg('会社HPの社長名はリストと同じでした');
      else if (j.reason) setLookMsg(j.reason);
      else setLookMsg('まだ調べています。次にこの会社を開くと出ます');
    } catch { setLookMsg('調べられませんでした'); }
    setLooking(false);
  };

  const save = async () => {
    const v = draft.trim();
    if (!v) { setEditing(false); return; }
    setSaving(true);
    const patch = { representative_kana: v, representative_kana_source: 'confirmed' };
    await supabase.from('call_list_items').update(patch).eq('id', row.id);
    if (row.corporate_number) {
      await supabase.from('call_list_items').update(patch).eq('corporate_number', row.corporate_number).eq('representative', row.representative);
    }
    setKana(v); setSource('confirmed'); setSaving(false); setEditing(false);
  };

  const shown = current || row.representative;
  const ruby = (
    <ruby style={{ rubyPosition: 'over' }}>
      {shown}
      {kana && <rt style={{ fontSize: compact ? 8 : 10, color: color.textMid, fontWeight: font.weight.normal, letterSpacing: '0.05em' }}>{kana}</rt>}
    </ruby>
  );
  if (compact) return ruby;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: space[1.5], flexWrap: 'wrap' }}>
      {ruby}
      {current && (
        <span title="リストに載っていた名前です。今の社長は左の名前です" style={{ fontSize: 9, color: color.textLight, textDecoration: 'line-through' }}>{row.representative}</span>
      )}
      {kana && source !== 'confirmed' && (
        <span title="AIが推定した読みです。電話で確かめたら直してください" style={{ fontSize: 9, color: color.textLight, border: `1px solid ${color.borderLight}`, borderRadius: radius.sm, padding: '0 4px', lineHeight: '14px' }}>推定</span>
      )}
      <button type="button" onClick={lookup} disabled={looking} title="受付で「社長は退任済み」と言われた時に押す"
        style={{ fontSize: 9, color: color.danger, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
        {looking ? '調べています…' : '社長名を調べる'}
      </button>
      {lookMsg && <span style={{ fontSize: 9, color: color.textMid, width: '100%' }}>{lookMsg}</span>}
      {!editing && (
        <button type="button" onClick={() => { setDraft(kana); setEditing(true); }}
          style={{ fontSize: 9, color: color.navy, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
          {kana ? '読みを直す' : '読みを入れる'}
        </button>
      )}
      {editing && (
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="やまだ たろう" autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            style={{ width: 120, fontSize: font.size.xs, padding: '2px 6px', border: `1px solid ${color.border}`, borderRadius: radius.sm, fontFamily: font.family.sans }} />
          <button type="button" onClick={save} disabled={saving}
            style={{ fontSize: 10, color: color.white, background: color.navy, border: 'none', borderRadius: radius.sm, padding: '2px 8px', cursor: 'pointer' }}>{saving ? '保存中' : '保存'}</button>
        </span>
      )}
    </span>
  );
}
