// =====================================================================
// 報酬体系マスタ管理 (MASP Members ページ内)
// ---------------------------------------------------------------------
// reward_types + reward_tiers の CRUD。admin 専用。
// 削除時は使用中クライアントが居れば警告
// =====================================================================

import { useEffect, useState } from 'react';
import { color, space, radius, font } from '../../../constants/design';
import { Button, Card } from '../../ui';
import { supabase } from '../../../lib/supabase';

const BASIS_OPTIONS = [
  { value: '-', label: '- (固定報酬)' },
  { value: '売上高', label: '売上高 (金額連動)' },
  { value: '当期純利益', label: '当期純利益 (金額連動)' },
  { value: 'アポ件数', label: 'アポ件数 (件数連動)' },
];
const TAX_OPTIONS = ['税別', '税込'];
const CALC_TYPE_OPTIONS = [
  { value: 'rate', label: 'rate (金額連動: tier ごとの price)' },
  { value: 'fixed_per_appo', label: 'fixed_per_appo (アポ件あたり定額/件数連動)' },
];

const blankTier = () => ({ lo: 0, hi: 999999, price: 0, memo: '' });

export default function RewardTypeManager({ isAdmin }) {
  const [types, setTypes] = useState([]); // [{ type_id, name, basis, tax, calc_type, sort_order, tiers: [] }]
  const [usageCounts, setUsageCounts] = useState({}); // { type_id: 使用クライアント数 }
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null); // { isNew, ...fields }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [{ data: tTypes, error: e1 }, { data: tTiers, error: e2 }, { data: usage }] = await Promise.all([
      supabase.from('reward_types').select('type_id, name, basis, tax, calc_type, sort_order').order('sort_order').order('type_id'),
      supabase.from('reward_tiers').select('id, type_id, lo, hi, price, memo, sort_order').order('type_id').order('sort_order'),
      supabase.from('client_engagement_reward_settings').select('reward_type'),
    ]);
    if (e1 || e2) {
      setError((e1 || e2).message);
      setLoading(false);
      return;
    }
    const byType = {};
    (tTiers || []).forEach(t => {
      if (!byType[t.type_id]) byType[t.type_id] = [];
      byType[t.type_id].push(t);
    });
    setTypes((tTypes || []).map(t => ({ ...t, tiers: byType[t.type_id] || [] })));
    const counts = {};
    (usage || []).forEach(u => { if (u.reward_type) counts[u.reward_type] = (counts[u.reward_type] || 0) + 1; });
    setUsageCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditTarget({
      isNew: true,
      type_id: '',
      name: '',
      basis: '売上高',
      tax: '税別',
      calc_type: 'rate',
      sort_order: types.length + 1,
      tiers: [blankTier()],
    });
  };

  const openEdit = (t) => {
    setEditTarget({
      isNew: false,
      type_id: t.type_id,
      original_type_id: t.type_id,
      name: t.name,
      basis: t.basis,
      tax: t.tax,
      calc_type: t.calc_type,
      sort_order: t.sort_order || 99,
      tiers: t.tiers.length > 0 ? t.tiers.map(x => ({ ...x })) : [blankTier()],
    });
  };

  const handleSave = async () => {
    if (!editTarget) return;
    const e = editTarget;
    if (!e.type_id.trim()) { setError('type_id は必須'); return; }
    if (!e.name.trim()) { setError('名称は必須'); return; }
    if (!e.tiers.length) { setError('段階(tier)は最低1つ必要'); return; }
    setSaving(true);
    setError(null);
    try {
      // 1. reward_types upsert
      const { error: tErr } = await supabase.from('reward_types').upsert({
        type_id: e.type_id.trim(),
        name: e.name.trim(),
        basis: e.basis,
        tax: e.tax,
        calc_type: e.calc_type,
        sort_order: Number(e.sort_order) || 99,
      });
      if (tErr) throw tErr;

      // 2. 既存 tiers を削除 → 新規 insert (シンプル方針)
      if (!e.isNew) {
        await supabase.from('reward_tiers').delete().eq('type_id', e.original_type_id);
        // type_id 変更時の整合性: client_engagement_reward_settings の reward_type も更新
        if (e.type_id !== e.original_type_id) {
          await supabase.from('client_engagement_reward_settings')
            .update({ reward_type: e.type_id })
            .eq('reward_type', e.original_type_id);
          await supabase.from('reward_types').delete().eq('type_id', e.original_type_id);
        }
      }
      const tierRows = e.tiers.map((t, idx) => ({
        type_id: e.type_id.trim(),
        lo: Number(t.lo) || 0,
        hi: Number(t.hi) || 999999,
        price: Number(t.price) || 0,
        memo: t.memo || null,
        sort_order: idx + 1,
      }));
      const { error: tiErr } = await supabase.from('reward_tiers').insert(tierRows);
      if (tiErr) throw tiErr;

      setEditTarget(null);
      load();
    } catch (err) {
      setError('保存失敗: ' + (err.message || String(err)));
    }
    setSaving(false);
  };

  const handleDelete = async (t) => {
    const usage = usageCounts[t.type_id] || 0;
    const msg = usage > 0
      ? `「${t.type_id}: ${t.name}」は ${usage} 社で使用中です。\n削除すると該当クライアントの reward_type が未設定になります。\n本当に削除しますか？`
      : `「${t.type_id}: ${t.name}」を削除しますか？`;
    if (!confirm(msg)) return;
    setSaving(true);
    // tiers → setting → type の順で削除
    await supabase.from('reward_tiers').delete().eq('type_id', t.type_id);
    if (usage > 0) {
      await supabase.from('client_engagement_reward_settings').delete().eq('reward_type', t.type_id);
    }
    await supabase.from('reward_types').delete().eq('type_id', t.type_id);
    setSaving(false);
    load();
  };

  const updateTier = (idx, key, value) => {
    setEditTarget(prev => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => i === idx ? { ...t, [key]: value } : t),
    }));
  };
  const addTier = () => {
    setEditTarget(prev => ({ ...prev, tiers: [...prev.tiers, blankTier()] }));
  };
  const removeTier = (idx) => {
    setEditTarget(prev => ({ ...prev, tiers: prev.tiers.filter((_, i) => i !== idx) }));
  };

  const inputStyle = {
    padding: '4px 8px', border: `1px solid ${color.border}`, borderRadius: radius.sm,
    fontSize: font.size.xs, fontFamily: font.family.sans, color: color.textDark,
    outline: 'none', boxSizing: 'border-box', background: color.white,
  };
  const labelStyle = { fontSize: 10, color: color.textLight, fontWeight: font.weight.semibold, marginBottom: 2, display: 'block' };

  return (
    <Card variant="default" padding="md" style={{ borderRadius: radius.md, marginBottom: space[4] }} bodyStyle={{ padding: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] }}>
        <div>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: color.navy }}>報酬体系マスタ管理</div>
          <div style={{ fontSize: font.size.xs, color: color.textMid, marginTop: 2 }}>
            reward_types + reward_tiers の CRUD。新規クライアントの報酬体系をここで定義し、CRM の「報酬体系(タイプ別)」から割り当てる
          </div>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openNew}>+ 新規追加</Button>
        )}
      </div>

      {error && <div style={{ marginBottom: space[2], fontSize: font.size.xs, color: color.danger }}>{error}</div>}

      {loading ? (
        <div style={{ padding: space[3], color: color.textMid, fontSize: font.size.xs }}>読み込み中…</div>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${color.border}`, borderRadius: radius.sm }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: color.navy, color: color.white, fontSize: font.size.xs }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: font.weight.semibold }}>ID</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: font.weight.semibold }}>名称</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: font.weight.semibold }}>基準</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: font.weight.semibold }}>税</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: font.weight.semibold }}>計算</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: font.weight.semibold }}>段階数</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: font.weight.semibold }}>使用</th>
                {isAdmin && <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: font.weight.semibold }}>操作</th>}
              </tr>
            </thead>
            <tbody>
              {types.map((t, i) => (
                <tr key={t.type_id} style={{ background: i % 2 === 0 ? color.white : color.gray50, fontSize: font.size.xs, borderTop: `1px solid ${color.borderLight}` }}>
                  <td style={{ padding: '8px 10px', fontFamily: font.family.mono, color: color.navy, fontWeight: font.weight.bold }}>{t.type_id}</td>
                  <td style={{ padding: '8px 10px', color: color.textDark, fontWeight: font.weight.medium }}>{t.name}</td>
                  <td style={{ padding: '8px 10px', color: color.textMid }}>{t.basis || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: color.textMid }}>{t.tax || '—'}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: color.textLight, fontSize: 10, fontFamily: font.family.mono }}>{t.calc_type}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: font.family.mono, color: color.textMid }}>{t.tiers.length}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: font.family.mono, color: (usageCounts[t.type_id] || 0) > 0 ? color.navy : color.textLight }}>
                    {usageCounts[t.type_id] || 0}社
                  </td>
                  {isAdmin && (
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <Button size="sm" variant="outline" onClick={() => openEdit(t)} style={{ fontSize: 10, padding: '2px 8px', marginRight: 4 }}>編集</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t)} style={{ color: color.danger, fontSize: 10, padding: '2px 8px' }}>削除</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 編集モーダル */}
      {editTarget && (
        <div onClick={() => !saving && setEditTarget(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: color.white, borderRadius: radius.lg, width: 720, maxWidth: '95vw',
            maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              padding: '12px 20px', background: color.navy, color: color.white,
              borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold }}>
                {editTarget.isNew ? '報酬体系を新規追加' : `報酬体系を編集 — ${editTarget.original_type_id}`}
              </span>
              <button onClick={() => !saving && setEditTarget(null)} style={{
                background: 'none', border: 'none', color: color.white, fontSize: 18, cursor: 'pointer',
              }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>type_id (例: A, B, O)</label>
                  <input value={editTarget.type_id} onChange={e => setEditTarget(p => ({ ...p, type_id: e.target.value.toUpperCase() }))}
                    style={{ ...inputStyle, fontFamily: font.family.mono, fontWeight: font.weight.bold }} />
                </div>
                <div>
                  <label style={labelStyle}>名称</label>
                  <input value={editTarget.name} onChange={e => setEditTarget(p => ({ ...p, name: e.target.value }))}
                    placeholder="例: 中単価利益連動4段階" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>基準 (basis)</label>
                  <select value={editTarget.basis} onChange={e => setEditTarget(p => ({ ...p, basis: e.target.value }))} style={inputStyle}>
                    {BASIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>税区分</label>
                  <select value={editTarget.tax} onChange={e => setEditTarget(p => ({ ...p, tax: e.target.value }))} style={inputStyle}>
                    {TAX_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>計算タイプ</label>
                  <select value={editTarget.calc_type} onChange={e => setEditTarget(p => ({ ...p, calc_type: e.target.value }))} style={inputStyle}>
                    {CALC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>並び順</label>
                  <input type="number" value={editTarget.sort_order} onChange={e => setEditTarget(p => ({ ...p, sort_order: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              {/* tier 編集 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>段階 (tier) — lo以上 hi未満 → price (memoがあれば優先表示)</label>
                  <button type="button" onClick={addTier} style={{
                    padding: '2px 10px', fontSize: 10, fontWeight: font.weight.semibold,
                    border: `1px solid ${color.navy}`, background: color.white, color: color.navy,
                    borderRadius: radius.sm, cursor: 'pointer',
                  }}>+ 段階を追加</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr 30px', gap: 6, fontSize: 9, color: color.textLight, padding: '0 4px' }}>
                    <span>lo (以上)</span>
                    <span>hi (未満)</span>
                    <span>price (円)</span>
                    <span>memo (表示用)</span>
                    <span></span>
                  </div>
                  {editTarget.tiers.map((t, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr 30px', gap: 6, alignItems: 'center' }}>
                      <input type="number" value={t.lo} onChange={e => updateTier(idx, 'lo', e.target.value)} style={{ ...inputStyle, fontFamily: font.family.mono }} />
                      <input type="number" value={t.hi} onChange={e => updateTier(idx, 'hi', e.target.value)} style={{ ...inputStyle, fontFamily: font.family.mono }} />
                      <input type="number" value={t.price} onChange={e => updateTier(idx, 'price', e.target.value)} style={{ ...inputStyle, fontFamily: font.family.mono }} />
                      <input value={t.memo || ''} onChange={e => updateTier(idx, 'memo', e.target.value)} placeholder="例: 5000万〜1億：20万円" style={inputStyle} />
                      <button type="button" onClick={() => removeTier(idx)} disabled={editTarget.tiers.length === 1} style={{
                        padding: '2px 6px', fontSize: 12, border: 'none', background: 'transparent',
                        color: editTarget.tiers.length === 1 ? color.textLight : color.danger,
                        cursor: editTarget.tiers.length === 1 ? 'not-allowed' : 'pointer',
                      }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {error && <div style={{ fontSize: font.size.xs, color: color.danger }}>{error}</div>}
            </div>
            <div style={{ padding: '10px 20px', borderTop: `1px solid ${color.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditTarget(null)}>キャンセル</Button>
              <Button variant="primary" size="sm" loading={saving} disabled={saving} onClick={handleSave}>
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
