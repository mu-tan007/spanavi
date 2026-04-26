import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../../lib/supabase';
import { getOrgId } from '../../lib/orgContext';
import { useEngagements } from '../../hooks/useEngagements';

const NAVY = '#0D2247';
const BORDER = '#E5E5E5';
const TEXT_MID = '#706E6B';

export default function EngagementSettings({ onToast }) {
  const { engagements } = useEngagements();
  const selectableEngagements = useMemo(
    () => (engagements || []).filter(e => e.slug !== 'masp' && e.status === 'active'),
    [engagements]
  );
  const [engagementId, setEngagementId] = useState(null);

  useEffect(() => {
    if (!engagementId && selectableEngagements.length > 0) {
      setEngagementId(selectableEngagements[0].id);
    }
  }, [engagementId, selectableEngagements]);

  if (!engagementId) {
    return <div style={{ padding: 40, textAlign: 'center', color: TEXT_MID, fontSize: 13 }}>事業がありません</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MID }}>事業:</div>
        <select value={engagementId} onChange={e => setEngagementId(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 3, border: `1px solid ${BORDER}`, fontSize: 13, color: NAVY, fontWeight: 600, fontFamily: "'Noto Sans JP'", minWidth: 180 }}>
          {selectableEngagements.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <RankSection engagementId={engagementId} onToast={onToast} />
      <div style={{ height: 32 }} />
      <RoleSection engagementId={engagementId} onToast={onToast} />
    </div>
  );
}

// ─── ランク管理 ─────────────────────────────────────────────
function RankSection({ engagementId, onToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', default_incentive_rate: '' });
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', default_incentive_rate: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('engagement_ranks')
      .select('id, name, display_order, default_incentive_rate')
      .eq('engagement_id', engagementId)
      .order('display_order');
    setRows(data || []);
    setLoading(false);
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newForm.name.trim()) return;
    setSaving(true);
    const nextOrder = (rows.length > 0 ? Math.max(...rows.map(r => r.display_order)) : 0) + 1;
    const rate = newForm.default_incentive_rate ? parseFloat(newForm.default_incentive_rate) / 100 : null;
    const { error } = await supabase.from('engagement_ranks').insert({
      org_id: getOrgId(),
      engagement_id: engagementId,
      name: newForm.name.trim(),
      display_order: nextOrder,
      default_incentive_rate: rate,
    });
    setSaving(false);
    if (error) { onToast?.(error.message.includes('unique') ? '同名のランクが存在します' : '追加失敗', 'error'); return; }
    setAdding(false); setNewForm({ name: '', default_incentive_rate: '' });
    onToast?.('ランクを追加しました');
    await load();
  };

  const handleSave = async () => {
    if (!editForm.name.trim() || !editingId) return;
    setSaving(true);
    const rate = editForm.default_incentive_rate !== '' ? parseFloat(editForm.default_incentive_rate) / 100 : null;
    const { error } = await supabase.from('engagement_ranks')
      .update({ name: editForm.name.trim(), default_incentive_rate: rate, updated_at: new Date().toISOString() })
      .eq('id', editingId);
    setSaving(false);
    if (error) { onToast?.('保存失敗', 'error'); return; }
    setEditingId(null); setEditForm({ name: '', default_incentive_rate: '' });
    onToast?.('保存しました');
    await load();
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`「${name}」を削除しますか？\n\n注意: このランクが設定されているメンバーがいた場合、ランクは未設定（NULL）になります。`)) return;
    const { error } = await supabase.from('engagement_ranks').delete().eq('id', id);
    if (error) { onToast?.('削除失敗', 'error'); return; }
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
    const oldIdx = rows.findIndex(r => r.id === active.id);
    const newIdx = rows.findIndex(r => r.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(rows, oldIdx, newIdx);
    setRows(reordered.map((r, i) => ({ ...r, display_order: i + 1 })));
    await Promise.all(reordered.map((r, i) =>
      r.display_order !== i + 1
        ? supabase.from('engagement_ranks').update({ display_order: i + 1 }).eq('id', r.id)
        : null
    ).filter(Boolean));
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>ランク管理</div>
        <div style={{ fontSize: 11, color: TEXT_MID }}>
          メンバーの階級と各ランクのデフォルトインセンティブ率を設定。行をドラッグで並び替え可。
        </div>
      </div>
      {loading ? <div style={{ padding: 20, color: TEXT_MID, fontSize: 12 }}>読込中…</div> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ ...thBase, width: 18, padding: '10px 2px' }}></th>
                  <th style={{ ...thBase, width: 60, textAlign: 'left' }}>順序</th>
                  <th style={{ ...thBase, textAlign: 'left' }}>ランク名</th>
                  <th style={{ ...thBase, textAlign: 'right' }}>デフォルト率</th>
                  <th style={{ ...thBase, textAlign: 'right', width: 200 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map((r, i) => (
                    <SortableRankRow
                      key={r.id} r={r} index={i} isLast={i === rows.length - 1}
                      isEditing={editingId === r.id}
                      editForm={editForm} setEditForm={setEditForm}
                      setEditingId={setEditingId}
                      handleSave={handleSave} handleDelete={handleDelete}
                      saving={saving}
                    />
                  ))}
                </SortableContext>
                {adding && (
                  <tr style={{ background: '#FFFBEA' }}>
                    <td style={tdBase}></td>
                    <td style={tdMid}>—</td>
                    <td style={tdBase}>
                      <input value={newForm.name} onChange={e => setNewForm(s => ({ ...s, name: e.target.value }))}
                        placeholder="例 シニアプレイヤー" autoFocus style={inp200} />
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right' }}>
                      <input type="number" step="0.1" value={newForm.default_incentive_rate}
                        onChange={e => setNewForm(s => ({ ...s, default_incentive_rate: e.target.value }))}
                        placeholder="例 24" style={{ ...inp80, fontFamily: "'JetBrains Mono'" }} />
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right' }}>
                      <button onClick={handleAdd} disabled={saving} style={primarySmallBtn}>{saving ? '…' : '追加'}</button>
                      <button onClick={() => { setAdding(false); setNewForm({ name: '', default_incentive_rate: '' }); }} disabled={saving} style={secondarySmallBtn}>取消</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DndContext>
      )}
      {!adding && !loading && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setAdding(true)} style={addBtn}>+ ランクを追加</button>
        </div>
      )}
    </div>
  );
}

function SortableRankRow({ r, index, isLast, isEditing, editForm, setEditForm, setEditingId, handleSave, handleDelete, saving }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: isDragging ? '#F8F8F8' : 'transparent',
    borderBottom: isLast ? 'none' : `1px solid ${BORDER}`,
  };
  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td style={{ ...tdBase, textAlign: 'center', width: 18, padding: '8px 2px', cursor: 'grab', color: TEXT_MID, userSelect: 'none' }} {...listeners}>⋮⋮</td>
      <td style={{ ...tdMid, fontFamily: "'JetBrains Mono'" }}>{index + 1}</td>
      <td style={{ ...tdBase, color: NAVY, fontWeight: 500 }}>
        {isEditing
          ? <input value={editForm.name} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} style={inp200} />
          : r.name}
      </td>
      <td style={{ ...tdBase, textAlign: 'right', fontFamily: "'JetBrains Mono'", color: NAVY }}>
        {isEditing
          ? <input type="number" step="0.1" value={editForm.default_incentive_rate}
              onChange={e => setEditForm(s => ({ ...s, default_incentive_rate: e.target.value }))}
              placeholder="例 22" style={{ ...inp80, fontFamily: "'JetBrains Mono'" }} />
          : (r.default_incentive_rate != null ? `${(Number(r.default_incentive_rate) * 100).toFixed(1).replace(/\.0$/, '')}%` : '—')}
      </td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        {isEditing ? (
          <>
            <button onClick={handleSave} disabled={saving} style={primarySmallBtn}>保存</button>
            <button onClick={() => { setEditingId(null); setEditForm({ name: '', default_incentive_rate: '' }); }} disabled={saving} style={secondarySmallBtn}>取消</button>
          </>
        ) : (
          <>
            <button onClick={() => { setEditingId(r.id); setEditForm({ name: r.name, default_incentive_rate: r.default_incentive_rate != null ? (Number(r.default_incentive_rate) * 100).toString() : '' }); }} style={secondarySmallBtn}>編集</button>
            <button onClick={() => handleDelete(r.id, r.name)} style={dangerSmallBtn}>削除</button>
          </>
        )}
      </td>
    </tr>
  );
}

// ─── 役割管理 ─────────────────────────────────────────────
function RoleSection({ engagementId, onToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('engagement_roles')
      .select('id, name, display_order')
      .eq('engagement_id', engagementId)
      .order('display_order');
    setRows(data || []);
    setLoading(false);
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const nextOrder = (rows.length > 0 ? Math.max(...rows.map(r => r.display_order)) : 0) + 1;
    const { error } = await supabase.from('engagement_roles').insert({
      org_id: getOrgId(),
      engagement_id: engagementId,
      name: newName.trim(),
      display_order: nextOrder,
    });
    setSaving(false);
    if (error) { onToast?.(error.message.includes('unique') ? '同名の役割が存在します' : '追加失敗', 'error'); return; }
    setAdding(false); setNewName('');
    onToast?.('役割を追加しました');
    await load();
  };

  const handleSave = async () => {
    if (!editName.trim() || !editingId) return;
    setSaving(true);
    const { error } = await supabase.from('engagement_roles')
      .update({ name: editName.trim(), updated_at: new Date().toISOString() })
      .eq('id', editingId);
    setSaving(false);
    if (error) { onToast?.('保存失敗', 'error'); return; }
    setEditingId(null); setEditName('');
    onToast?.('保存しました');
    await load();
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const { error } = await supabase.from('engagement_roles').delete().eq('id', id);
    if (error) { onToast?.('削除失敗', 'error'); return; }
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
    const oldIdx = rows.findIndex(r => r.id === active.id);
    const newIdx = rows.findIndex(r => r.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(rows, oldIdx, newIdx);
    setRows(reordered.map((r, i) => ({ ...r, display_order: i + 1 })));
    await Promise.all(reordered.map((r, i) =>
      r.display_order !== i + 1
        ? supabase.from('engagement_roles').update({ display_order: i + 1 }).eq('id', r.id)
        : null
    ).filter(Boolean));
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>役割管理</div>
        <div style={{ fontSize: 11, color: TEXT_MID }}>
          チーム内の役割（リーダー / 副リーダー / メンバーなど）。事業ごとに独自の名称を設定可。行をドラッグで並び替え可。
        </div>
      </div>
      {loading ? <div style={{ padding: 20, color: TEXT_MID, fontSize: 12 }}>読込中…</div> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ ...thBase, width: 18, padding: '10px 2px' }}></th>
                  <th style={{ ...thBase, width: 60, textAlign: 'left' }}>順序</th>
                  <th style={{ ...thBase, textAlign: 'left' }}>役割名</th>
                  <th style={{ ...thBase, textAlign: 'right', width: 200 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map((r, i) => (
                    <SortableRoleRow
                      key={r.id} r={r} index={i} isLast={i === rows.length - 1}
                      isEditing={editingId === r.id}
                      editName={editName} setEditName={setEditName}
                      setEditingId={setEditingId}
                      handleSave={handleSave} handleDelete={handleDelete}
                      saving={saving}
                    />
                  ))}
                </SortableContext>
                {adding && (
                  <tr style={{ background: '#FFFBEA' }}>
                    <td style={tdBase}></td>
                    <td style={tdMid}>—</td>
                    <td style={tdBase}>
                      <input value={newName} onChange={e => setNewName(e.target.value)}
                        placeholder="例 マネージャー" autoFocus style={inp200} />
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
      )}
      {!adding && !loading && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setAdding(true)} style={addBtn}>+ 役割を追加</button>
        </div>
      )}
    </div>
  );
}

function SortableRoleRow({ r, index, isLast, isEditing, editName, setEditName, setEditingId, handleSave, handleDelete, saving }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: isDragging ? '#F8F8F8' : 'transparent',
    borderBottom: isLast ? 'none' : `1px solid ${BORDER}`,
  };
  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td style={{ ...tdBase, textAlign: 'center', width: 18, padding: '8px 2px', cursor: 'grab', color: TEXT_MID, userSelect: 'none' }} {...listeners}>⋮⋮</td>
      <td style={{ ...tdMid, fontFamily: "'JetBrains Mono'" }}>{index + 1}</td>
      <td style={{ ...tdBase, color: NAVY, fontWeight: 500 }}>
        {isEditing
          ? <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus style={inp200} />
          : r.name}
      </td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        {isEditing ? (
          <>
            <button onClick={handleSave} disabled={saving} style={primarySmallBtn}>保存</button>
            <button onClick={() => { setEditingId(null); setEditName(''); }} disabled={saving} style={secondarySmallBtn}>取消</button>
          </>
        ) : (
          <>
            <button onClick={() => { setEditingId(r.id); setEditName(r.name); }} style={secondarySmallBtn}>編集</button>
            <button onClick={() => handleDelete(r.id, r.name)} style={dangerSmallBtn}>削除</button>
          </>
        )}
      </td>
    </tr>
  );
}

// styles
const thBase = { padding: '10px 12px', fontSize: 11, fontWeight: 600, color: NAVY };
const tdBase = { padding: '8px 12px' };
const tdMid = { padding: '8px 12px', color: TEXT_MID };
const inp200 = { padding: '5px 8px', borderRadius: 3, border: `1px solid ${NAVY}`, fontSize: 12, width: 220, fontFamily: "'Noto Sans JP'" };
const inp80 = { padding: '5px 8px', borderRadius: 3, border: `1px solid ${NAVY}`, fontSize: 12, width: 80, textAlign: 'right' };
const primarySmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' };
const secondarySmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' };
const dangerSmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' };
const addBtn = { padding: '7px 16px', fontSize: 12, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" };
