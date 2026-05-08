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
import { color, space, radius, font } from '../../constants/design';
import { Button, Card } from '../ui';

const NAVY = color.navy;
const BORDER = color.border;
const TEXT_MID = color.textMid;

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
    return <div style={{ padding: space[10], textAlign: 'center', color: TEXT_MID, fontSize: font.size.base }}>読込中…</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: NAVY, marginBottom: space[1.5] }}>会社の役職</div>
        <div style={{ fontSize: font.size.xs, color: TEXT_MID, lineHeight: 1.6 }}>
          MyPage や MASP {'>'} Members で選択できる役職一覧。代表取締役・取締役などの法人上の役職を管理します。<br />
          行をドラッグで並び替えできます。
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Card variant="default" padding="none">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
            <thead>
              <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ ...thBase, width: 18, padding: `${space[2.5]}px 2px` }}></th>
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
                      style={inlineInputStyle} />
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>
                    <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving} loading={saving} style={{ marginRight: 4 }}>{saving ? '…' : '追加'}</Button>
                    <Button variant="secondary" size="sm" onClick={() => { setAdding(false); setNewName(''); }} disabled={saving}>取消</Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </DndContext>

      {!adding && (
        <div style={{ marginTop: space[3] }}>
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            + 役職を追加
          </Button>
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
      <td style={{ ...tdBase, textAlign: 'center', width: 18, padding: `${space[2]}px 2px`, cursor: 'grab', color: TEXT_MID, userSelect: 'none' }} {...listeners}>
        ⋮⋮
      </td>
      <td style={{ ...tdMid, fontFamily: font.family.mono }}>{index + 1}</td>
      <td style={{ ...tdBase, color: NAVY, fontWeight: font.weight.medium }}>
        {isEditing ? (
          <input value={editName} onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') { setEditingId(null); setEditName(''); } }}
            autoFocus
            style={inlineInputStyle} />
        ) : p.name}
      </td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        {isEditing ? (
          <>
            <Button variant="primary" size="sm" onClick={handleSaveEdit} disabled={saving} loading={saving} style={{ marginRight: 4 }}>保存</Button>
            <Button variant="secondary" size="sm" onClick={() => { setEditingId(null); setEditName(''); }} disabled={saving}>取消</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => { setEditingId(p.id); setEditName(p.name); }} style={{ marginRight: 4 }}>編集</Button>
            <Button variant="danger" size="sm" onClick={() => handleDelete(p.id, p.name)}>削除</Button>
          </>
        )}
      </td>
    </tr>
  );
}

const thBase = { padding: `${space[2.5]}px ${space[3]}px`, fontSize: font.size.xs, fontWeight: font.weight.semibold, color: NAVY };
const tdBase = { padding: `${space[2]}px ${space[3]}px` };
const tdMid = { padding: `${space[2]}px ${space[3]}px`, color: TEXT_MID };
const inlineInputStyle = { padding: `5px ${space[2]}px`, borderRadius: radius.sm, border: `1px solid ${NAVY}`, fontSize: font.size.sm, width: 200, fontFamily: font.family.sans };
