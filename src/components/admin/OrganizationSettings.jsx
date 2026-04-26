import { useState, useEffect, useCallback } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
    if (error) { onToast?.('保存に失敗しました', 'error'); return; }
    setEditingId(null); setEditName('');
    onToast?.('保存しました');
    await load();
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`「${name}」を削除しますか？\n\n注意: このポジションを設定中のメンバーがいた場合、その人の役職表示は空欄になります（データは保持されます）。`)) return;
    const { error } = await supabase.from('organization_positions').delete().eq('id', id);
    if (error) { onToast?.('削除に失敗しました', 'error'); return; }
    onToast?.('削除しました');
    await load();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = positions.findIndex(p => p.id === active.id);
    const newIdx = positions.findIndex(p => p.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(positions, oldIdx, newIdx);
    // 1, 2, 3, ... の連番でリナンバー
    const updates = reordered.map((p, i) => ({ id: p.id, newOrder: i + 1 })).filter((u, i) => positions.find(p => p.id === u.id)?.display_order !== u.newOrder);
    setPositions(reordered.map((p, i) => ({ ...p, display_order: i + 1 })));
    await Promise.all(updates.map(u =>
      supabase.from('organization_positions').update({ display_order: u.newOrder }).eq('id', u.id)
    ));
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: TEXT_MID, fontSize: 13 }}>読込中…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>会社の役職</div>
        <div style={{ fontSize: 11, color: TEXT_MID, lineHeight: 1.6 }}>
          MyPage や MASP {'>'} Members で選択できる役職一覧。代表取締役・取締役などの法人上の役職を管理します。<br />
          行をドラッグで並び替えできます。
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ ...thBase, width: 18, padding: '10px 2px' }}></th>
                <th style={{ ...thBase, width: 60, textAlign: 'left' }}>順序</th>
                <th style={{ ...thBase, textAlign: 'left' }}>役職名</th>
                <th style={{ ...thBase, textAlign: 'right', width: 200 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              <SortableContext items={positions.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {positions.map((p, i) => (
                  <SortableRow
                    key={p.id} p={p} index={i} isLast={i === positions.length - 1}
                    isEditing={editingId === p.id}
                    editName={editName} setEditName={setEditName}
                    setEditingId={setEditingId}
                    handleSaveEdit={handleSaveEdit}
                    handleDelete={handleDelete}
                    saving={saving}
                  />
                ))}
              </SortableContext>
              {adding && (
                <tr style={{ background: '#FFFBEA', borderBottom: `1px solid ${BORDER}` }}>
                  <td style={tdBase}></td>
                  <td style={tdMid}>—</td>
                  <td style={tdBase}>
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                      autoFocus placeholder="例: 顧問"
                      style={{ padding: '5px 8px', borderRadius: 3, border: `1px solid ${NAVY}`, fontSize: 12, width: 200, fontFamily: "'Noto Sans JP'" }} />
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>
                    <button onClick={handleAdd} disabled={saving} style={primarySmallBtn}>{saving ? '…' : '追加'}</button>
                    <button onClick={() => { setAdding(false); setNewName(''); }} disabled={saving} style={secondarySmallBtn}>取消</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DndContext>

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

function SortableRow({ p, index, isLast, isEditing, editName, setEditName, setEditingId, handleSaveEdit, handleDelete, saving }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: isDragging ? '#F8F8F8' : 'transparent',
    borderBottom: isLast ? 'none' : `1px solid ${BORDER}`,
  };
  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td style={{ ...tdBase, textAlign: 'center', width: 18, padding: '8px 2px', cursor: 'grab', color: TEXT_MID, userSelect: 'none' }} {...listeners}>
        ⋮⋮
      </td>
      <td style={{ ...tdMid, fontFamily: "'JetBrains Mono'" }}>{index + 1}</td>
      <td style={{ ...tdBase, color: NAVY, fontWeight: 500 }}>
        {isEditing ? (
          <input value={editName} onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') { setEditingId(null); setEditName(''); } }}
            autoFocus
            style={{ padding: '5px 8px', borderRadius: 3, border: `1px solid ${NAVY}`, fontSize: 12, width: 200, fontFamily: "'Noto Sans JP'" }} />
        ) : p.name}
      </td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        {isEditing ? (
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
  );
}

const thBase = { padding: '10px 12px', fontSize: 11, fontWeight: 600, color: NAVY };
const tdBase = { padding: '8px 12px' };
const tdMid = { padding: '8px 12px', color: TEXT_MID };
const primarySmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' };
const secondarySmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' };
const dangerSmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' };
