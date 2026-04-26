import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';

const NAVY = '#0D2247';
const BORDER = '#E5E5E5';
const TEXT_MID = '#706E6B';

export default function OrganizationSettings({ onToast }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organization_positions')
      .select('id, name, display_order')
      .eq('org_id', getOrgId())
      .order('display_order');
    if (error) onToast?.('役職の取得に失敗しました', 'error');
    else setPositions(data || []);
    setLoading(false);
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const nextOrder = (positions.length > 0 ? Math.max(...positions.map(p => p.display_order)) : 0) + 1;
    const { error } = await supabase.from('organization_positions').insert({
      org_id: getOrgId(),
      name: newName.trim(),
      display_order: nextOrder,
    });
    setSaving(false);
    if (error) {
      onToast?.(error.message.includes('unique') ? '同名の役職が既に存在します' : '追加に失敗しました', 'error');
      return;
    }
    setNewName('');
    setAdding(false);
    onToast?.('役職を追加しました');
    await load();
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    setSaving(true);
    const { error } = await supabase.from('organization_positions')
      .update({ name: editName.trim(), updated_at: new Date().toISOString() })
      .eq('id', editingId);
    setSaving(false);
    if (error) {
      onToast?.('保存に失敗しました', 'error');
      return;
    }
    setEditingId(null);
    setEditName('');
    onToast?.('保存しました');
    await load();
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`「${name}」を削除しますか？\n\n注意: このポジションを設定中のメンバーがいた場合、その人の役職表示は空欄になります（データは保持されます）。`)) return;
    const { error } = await supabase.from('organization_positions').delete().eq('id', id);
    if (error) {
      onToast?.('削除に失敗しました', 'error');
      return;
    }
    onToast?.('削除しました');
    await load();
  };

  const move = async (id, direction) => {
    const idx = positions.findIndex(p => p.id === id);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= positions.length) return;
    const a = positions[idx];
    const b = positions[swapIdx];
    await Promise.all([
      supabase.from('organization_positions').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('organization_positions').update({ display_order: a.display_order }).eq('id', b.id),
    ]);
    await load();
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: TEXT_MID, fontSize: 13 }}>読込中…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>会社の役職</div>
        <div style={{ fontSize: 11, color: TEXT_MID, lineHeight: 1.6 }}>
          MyPage や MASP {'>'} Members で選択できる役職一覧。代表取締役・取締役などの法人上の役職を管理します。
        </div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: NAVY, width: 60 }}>順序</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: NAVY }}>役職名</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: NAVY, width: 200 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: i < positions.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <td style={{ padding: '8px 12px', color: TEXT_MID, fontFamily: "'JetBrains Mono'" }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => move(p.id, -1)} disabled={i === 0}
                      style={{ ...iconBtn, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                    <button onClick={() => move(p.id, 1)} disabled={i === positions.length - 1}
                      style={{ ...iconBtn, opacity: i === positions.length - 1 ? 0.3 : 1 }}>↓</button>
                  </div>
                </td>
                <td style={{ padding: '8px 12px', color: NAVY, fontWeight: 500 }}>
                  {editingId === p.id ? (
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') { setEditingId(null); setEditName(''); } }}
                      autoFocus
                      style={{ padding: '5px 8px', borderRadius: 3, border: `1px solid ${NAVY}`, fontSize: 12, width: 200, fontFamily: "'Noto Sans JP'" }} />
                  ) : p.name}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  {editingId === p.id ? (
                    <>
                      <button onClick={handleSaveEdit} disabled={saving} style={primarySmallBtn}>保存</button>
                      <button onClick={() => { setEditingId(null); setEditName(''); }} disabled={saving} style={secondarySmallBtn}>取消</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(p.id); setEditName(p.name); }} style={secondarySmallBtn}>編集</button>
                      <button onClick={() => handleDelete(p.id, p.name)} style={dangerSmallBtn}>削除</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {adding && (
              <tr style={{ background: '#FFFBEA', borderBottom: `1px solid ${BORDER}` }}>
                <td style={{ padding: '8px 12px', color: TEXT_MID }}>—</td>
                <td style={{ padding: '8px 12px' }}>
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                    autoFocus placeholder="例: 顧問"
                    style={{ padding: '5px 8px', borderRadius: 3, border: `1px solid ${NAVY}`, fontSize: 12, width: 200, fontFamily: "'Noto Sans JP'" }} />
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <button onClick={handleAdd} disabled={saving} style={primarySmallBtn}>{saving ? '…' : '追加'}</button>
                  <button onClick={() => { setAdding(false); setNewName(''); }} disabled={saving} style={secondarySmallBtn}>取消</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!adding && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setAdding(true)}
            style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>
            + 役職を追加
          </button>
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  padding: '2px 8px', fontSize: 11, background: '#fff', color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 2, cursor: 'pointer',
};
const primarySmallBtn = {
  padding: '4px 12px', fontSize: 11, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'",
};
const secondarySmallBtn = {
  padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'",
};
const dangerSmallBtn = {
  padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'",
};
