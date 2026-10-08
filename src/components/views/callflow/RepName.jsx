import { useState } from 'react';
import { color, font, radius, space } from '../../../constants/design';
import { supabase } from '../../../lib/supabase';

/**
 * 社長の名前と、その上の小さなふりがな（2026-10-08 むー様）。
 * ふりがなは AI の推定（representative_kana_source='ai'）なら「推定」と出す。
 * 電話で正しい読みを聞いたら「読みを直す」で直せる。直した読みは、同じ法人番号の会社（別のリスト）にも入る。
 */
export default function RepName({ row, compact = false }) {
  const [kana, setKana] = useState(row?.representative_kana && row.representative_kana !== '-' ? row.representative_kana : '');
  const [source, setSource] = useState(row?.representative_kana_source || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  if (!row?.representative) return null;

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

  const ruby = (
    <ruby style={{ rubyPosition: 'over' }}>
      {row.representative}
      {kana && <rt style={{ fontSize: compact ? 8 : 10, color: color.textMid, fontWeight: font.weight.normal, letterSpacing: '0.05em' }}>{kana}</rt>}
    </ruby>
  );
  if (compact) return ruby;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: space[1.5], flexWrap: 'wrap' }}>
      {ruby}
      {kana && source !== 'confirmed' && (
        <span title="AIが推定した読みです。電話で確かめたら直してください" style={{ fontSize: 9, color: color.textLight, border: `1px solid ${color.borderLight}`, borderRadius: radius.sm, padding: '0 4px', lineHeight: '14px' }}>推定</span>
      )}
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
