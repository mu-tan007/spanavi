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

      <RoleSection engagementId={engagementId} onToast={onToast} />
      <div style={{ height: 32 }} />
      <RankSection engagementId={engagementId} onToast={onToast} />
      <div style={{ height: 32 }} />
      <NotificationRulesSection engagementId={engagementId} onToast={onToast} />
    </div>
  );
}

// ─── 通知ルール ─────────────────────────────────────────────
const SCOPE_OPTIONS = [
  { value: 'all_engagement_members',  label: '事業全員' },
  { value: 'team_leaders_and_above',  label: 'チームリーダー以上' },
  { value: 'getter_and_team_and_admin', label: '取得者+リーダー+admin' },
  { value: 'admin_only',              label: 'admin のみ' },
];

function NotificationRulesSection({ engagementId, onToast }) {
  const [catalog, setCatalog] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [editingType, setEditingType] = useState(null); // null | { isNew, ...row }

  const load = useCallback(async () => {
    setLoading(true);
    const [cat, ov] = await Promise.all([
      supabase.from('notification_type_catalog')
        .select('*').eq('is_active', true).order('display_order'),
      supabase.from('engagement_notification_settings')
        .select('*').eq('engagement_id', engagementId),
    ]);
    setCatalog(cat.data || []);
    const map = {};
    (ov.data || []).forEach(r => { map[r.notification_type] = r; });
    setOverrides(map);
    setLoading(false);
  }, [engagementId]);

  useEffect(() => { load(); }, [load]);

  const upsert = async (typeId, patch) => {
    setSavingId(typeId);
    const cat = catalog.find(c => c.id === typeId);
    const existing = overrides[typeId];
    const row = {
      org_id: getOrgId(),
      engagement_id: engagementId,
      notification_type: typeId,
      enabled: existing?.enabled ?? true,
      recipients_scope: existing?.recipients_scope ?? cat?.default_recipients_scope ?? 'all_engagement_members',
      threshold_value: existing?.threshold_value ?? null,
      ...patch,
    };
    const { data, error } = await supabase
      .from('engagement_notification_settings')
      .upsert(row, { onConflict: 'engagement_id,notification_type' })
      .select()
      .single();
    setSavingId(null);
    if (error) { onToast?.('保存に失敗しました: ' + error.message, 'error'); return; }
    setOverrides(prev => ({ ...prev, [typeId]: data }));
  };

  const handleSaveType = async (form) => {
    const isNew = form.isNew;
    const id = isNew ? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t_${Date.now()}_${Math.random().toString(36).slice(2,8)}`) : form.id;
    const row = {
      id,
      label_jp: form.label_jp.trim(),
      description_jp: form.description_jp.trim() || null,
      default_recipients_scope: form.default_recipients_scope,
      has_threshold: !!form.has_threshold,
      threshold_unit: form.has_threshold ? (form.threshold_unit || null) : null,
      display_order: form.display_order || ((catalog.at(-1)?.display_order || 0) + 1),
      is_active: true,
      org_id: getOrgId(),
      is_system: false,
    };
    if (!row.label_jp) { onToast?.('ラベルは必須です', 'error'); return; }

    if (isNew) {
      const { error } = await supabase.from('notification_type_catalog').insert(row);
      if (error) { onToast?.('追加に失敗: ' + error.message, 'error'); return; }
      onToast?.('通知種類を追加しました');
    } else {
      const { error } = await supabase.from('notification_type_catalog')
        .update({
          label_jp: row.label_jp,
          description_jp: row.description_jp,
          default_recipients_scope: row.default_recipients_scope,
          has_threshold: row.has_threshold,
          threshold_unit: row.threshold_unit,
        })
        .eq('id', id);
      if (error) { onToast?.('更新に失敗: ' + error.message, 'error'); return; }
      onToast?.('通知種類を更新しました');
    }
    setEditingType(null);
    await load();
  };

  const handleDeleteType = async (cat) => {
    if (cat.is_system) return;
    if (!window.confirm(`「${cat.label_jp}」を削除しますか？\n各事業の設定もまとめて削除されます。`)) return;
    // engagement_notification_settings の子行を先に削除
    await supabase.from('engagement_notification_settings')
      .delete().eq('notification_type', cat.id);
    const { error } = await supabase.from('notification_type_catalog')
      .delete().eq('id', cat.id);
    if (error) { onToast?.('削除に失敗: ' + error.message, 'error'); return; }
    onToast?.('通知種類を削除しました');
    await load();
  };

  const getEffective = (cat) => {
    const ov = overrides[cat.id];
    return {
      enabled: ov?.enabled ?? true,
      recipients_scope: ov?.recipients_scope ?? cat.default_recipients_scope,
      threshold_value: ov?.threshold_value ?? null,
    };
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>通知ルール</div>
          <div style={{ fontSize: 11, color: TEXT_MID, lineHeight: 1.6 }}>
            この事業で送る通知の ON/OFF・受信者範囲・閾値を管理します。<br />
            設定変更は即時反映されます。個人ごとの ON/OFF は MyPage から行えます。
          </div>
        </div>
        <button
          onClick={() => setEditingType({
            isNew: true,
            label_jp: '',
            description_jp: '',
            default_recipients_scope: 'all_engagement_members',
            has_threshold: false,
            threshold_unit: '',
          })}
          style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'", whiteSpace: 'nowrap' }}
        >+ 通知種類を追加</button>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
              <th style={{ ...thBase, textAlign: 'left' }}>通知種類</th>
              <th style={{ ...thBase, textAlign: 'center', width: 80 }}>ON/OFF</th>
              <th style={{ ...thBase, textAlign: 'left', width: 220 }}>受信者範囲</th>
              <th style={{ ...thBase, textAlign: 'right', width: 160 }}>閾値</th>
              <th style={{ ...thBase, textAlign: 'right', width: 140 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...tdMid, padding: 20, textAlign: 'center' }}>読込中…</td></tr>
            ) : catalog.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdMid, padding: 20, textAlign: 'center' }}>通知種類がありません</td></tr>
            ) : catalog.map(cat => {
              const eff = getEffective(cat);
              const busy = savingId === cat.id;
              return (
                <tr key={cat.id} style={{ borderTop: `1px solid ${BORDER}`, opacity: busy ? 0.6 : 1 }}>
                  <td style={tdBase}>
                    <div style={{ fontWeight: 600, color: NAVY }}>{cat.label_jp}</div>
                    {cat.description_jp && (
                      <div style={{ fontSize: 10.5, color: TEXT_MID, marginTop: 2, lineHeight: 1.5 }}>
                        {cat.description_jp}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: busy ? 'wait' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={eff.enabled}
                        disabled={busy}
                        onChange={e => upsert(cat.id, { enabled: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: busy ? 'wait' : 'pointer' }}
                      />
                    </label>
                  </td>
                  <td style={tdBase}>
                    <select
                      value={eff.recipients_scope}
                      disabled={busy || !eff.enabled}
                      onChange={e => upsert(cat.id, { recipients_scope: e.target.value })}
                      style={{ padding: '4px 8px', borderRadius: 3, border: `1px solid ${BORDER}`, fontSize: 11, fontFamily: "'Noto Sans JP'", color: NAVY, width: '100%', maxWidth: 200 }}
                    >
                      {SCOPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>
                    {cat.has_threshold ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          value={eff.threshold_value ?? ''}
                          disabled={busy || !eff.enabled}
                          onBlur={e => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            if (v !== eff.threshold_value) upsert(cat.id, { threshold_value: v });
                          }}
                          onChange={e => {
                            setOverrides(prev => ({
                              ...prev,
                              [cat.id]: { ...(prev[cat.id] || {}), threshold_value: e.target.value === '' ? null : Number(e.target.value), enabled: eff.enabled, recipients_scope: eff.recipients_scope, notification_type: cat.id, engagement_id: engagementId, org_id: getOrgId() },
                            }));
                          }}
                          placeholder="未設定"
                          style={{ padding: '4px 8px', borderRadius: 3, border: `1px solid ${BORDER}`, fontSize: 11, width: 110, textAlign: 'right', fontFamily: 'monospace' }}
                        />
                        {cat.threshold_unit && <span style={{ fontSize: 10.5, color: TEXT_MID }}>{cat.threshold_unit}</span>}
                      </div>
                    ) : (
                      <span style={{ fontSize: 10.5, color: TEXT_MID }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>
                    {cat.is_system ? (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#F3F4F6', color: TEXT_MID, fontWeight: 600 }}>システム</span>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingType({ isNew: false, ...cat })}
                          style={{ padding: '3px 10px', fontSize: 10.5, fontWeight: 600, background: '#fff', color: NAVY, border: `1px solid ${NAVY}`, borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'" }}
                        >編集</button>
                        <button
                          onClick={() => handleDeleteType(cat)}
                          style={{ padding: '3px 10px', fontSize: 10.5, fontWeight: 600, background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}
                        >削除</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingType && (
        <NotificationTypeFormModal
          form={editingType}
          onSave={handleSaveType}
          onCancel={() => setEditingType(null)}
        />
      )}
    </div>
  );
}

// 追加・編集モーダル
function NotificationTypeFormModal({ form, onSave, onCancel }) {
  const [local, setLocal] = useState(form);
  const u = (k, v) => setLocal(p => ({ ...p, [k]: v }));
  const isNew = local.isNew;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 24, fontFamily: "'Noto Sans JP', sans-serif" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>
          {isNew ? '通知種類を追加' : '通知種類を編集'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TEXT_MID, marginBottom: 4 }}>名称 *</label>
            <input value={local.label_jp || ''} onChange={e => u('label_jp', e.target.value)}
              placeholder="例: 大型受注セレブレーション"
              style={{ width: '100%', padding: '7px 10px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: "'Noto Sans JP'", boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TEXT_MID, marginBottom: 4 }}>説明</label>
            <textarea value={local.description_jp || ''} onChange={e => u('description_jp', e.target.value)}
              rows={2}
              placeholder="どんな時に送る通知か"
              style={{ width: '100%', padding: '7px 10px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: "'Noto Sans JP'", boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TEXT_MID, marginBottom: 4 }}>デフォルト受信者範囲</label>
            <select value={local.default_recipients_scope || 'all_engagement_members'}
              onChange={e => u('default_recipients_scope', e.target.value)}
              style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: "'Noto Sans JP'", color: NAVY, boxSizing: 'border-box' }}>
              {SCOPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="hasThreshold" type="checkbox" checked={!!local.has_threshold}
              onChange={e => u('has_threshold', e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="hasThreshold" style={{ fontSize: 12, color: NAVY, cursor: 'pointer' }}>閾値（数値）を持つ</label>
          </div>
          {local.has_threshold && (
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: TEXT_MID, marginBottom: 4 }}>閾値の単位</label>
              <input value={local.threshold_unit || ''} onChange={e => u('threshold_unit', e.target.value)}
                placeholder="例: 円 / 件"
                style={{ width: 200, padding: '7px 10px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: "'Noto Sans JP'", boxSizing: 'border-box' }} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onCancel}
            style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: '#fff', color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>キャンセル</button>
          <button onClick={() => onSave(local)}
            style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" }}>{isNew ? '追加' : '保存'}</button>
        </div>
      </div>
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
    if (error) { onToast?.(error.message.includes('unique') ? '同名のポジションが存在します' : '追加失敗', 'error'); return; }
    setAdding(false); setNewName('');
    onToast?.('ポジションを追加しました');
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
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>ポジション管理</div>
        <div style={{ fontSize: 11, color: TEXT_MID }}>
          事業内のポジション（リーダー / 副リーダー / メンバーなど）。各事業の Members 画面のポジション dropdown に反映されます。事業ごとに独自の名称を設定可。行をドラッグで並び替え可。
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
                  <th style={{ ...thBase, textAlign: 'left' }}>ポジション名</th>
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
          <button onClick={() => setAdding(true)} style={addBtn}>+ ポジションを追加</button>
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
