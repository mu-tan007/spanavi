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
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';

const NAVY = color.navy;
const BORDER = color.border;
const TEXT_MID = color.textMid;

// engagementId は親（AdminView）の対象事業セレクタから受け取る
export default function EngagementSettings({ engagementId, onToast }) {
  if (!engagementId) {
    return <div style={{ padding: space[10], textAlign: 'center', color: TEXT_MID, fontSize: font.size.base }}>対象事業を選択してください</div>;
  }

  return (
    <div>
      <RoleSection engagementId={engagementId} onToast={onToast} />
      <div style={{ height: space[8] }} />
      <RankSection engagementId={engagementId} onToast={onToast} />
      <div style={{ height: space[8] }} />
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
    const [cat, ov, hidden] = await Promise.all([
      supabase.from('notification_type_catalog')
        .select('*').eq('is_active', true).order('display_order'),
      supabase.from('engagement_notification_settings')
        .select('*').eq('engagement_id', engagementId),
      supabase.from('org_hidden_notification_types')
        .select('notification_type').eq('org_id', getOrgId()),
    ]);
    const hiddenSet = new Set((hidden.data || []).map(r => r.notification_type));
    setCatalog((cat.data || []).filter(c => !hiddenSet.has(c.id)));
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
    const isSys = cat.is_system;
    const confirmMsg = isSys
      ? `「${cat.label_jp}」を削除しますか？\n通知ルール・MyPage から消え、各事業の設定もまとめて削除されます。\n（後から復元可能です）`
      : `「${cat.label_jp}」を削除しますか？\n各事業の設定もまとめて削除されます。`;
    if (!window.confirm(confirmMsg)) return;

    // どちらの場合も、まず engagement 別設定を削除して綺麗にする
    await supabase.from('engagement_notification_settings')
      .delete().eq('notification_type', cat.id);

    if (isSys) {
      // system seed は org 別に非表示化（物理削除しない）
      const { error } = await supabase.from('org_hidden_notification_types')
        .upsert({ org_id: getOrgId(), notification_type: cat.id });
      if (error) { onToast?.('削除に失敗: ' + error.message, 'error'); return; }
      onToast?.('通知種類を削除しました');
    } else {
      const { error } = await supabase.from('notification_type_catalog')
        .delete().eq('id', cat.id);
      if (error) { onToast?.('削除に失敗: ' + error.message, 'error'); return; }
      onToast?.('通知種類を削除しました');
    }
    await load();
  };

  // 非表示化したシステム種類を復元
  const [hiddenList, setHiddenList] = useState([]);
  useEffect(() => {
    (async () => {
      const { data: hidden } = await supabase.from('org_hidden_notification_types')
        .select('notification_type').eq('org_id', getOrgId());
      if (!hidden || hidden.length === 0) { setHiddenList([]); return; }
      const ids = hidden.map(h => h.notification_type);
      const { data: cats } = await supabase.from('notification_type_catalog')
        .select('id, label_jp').in('id', ids);
      setHiddenList(cats || []);
    })();
  }, [catalog]);

  const restoreHidden = async (typeId) => {
    const { error } = await supabase.from('org_hidden_notification_types')
      .delete().eq('org_id', getOrgId()).eq('notification_type', typeId);
    if (error) { onToast?.('復元に失敗: ' + error.message, 'error'); return; }
    onToast?.('通知種類を復元しました');
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: space[3], gap: space[3] }}>
        <div>
          <div style={{ fontSize: font.size.base, fontWeight: font.weight.bold, color: NAVY, marginBottom: 4 }}>通知ルール</div>
          <div style={{ fontSize: font.size.xs, color: TEXT_MID, lineHeight: 1.6 }}>
            この事業で送る通知の ON/OFF・受信者範囲・閾値を管理します。<br />
            設定変更は即時反映されます。個人ごとの ON/OFF は MyPage から行えます。
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setEditingType({
            isNew: true,
            label_jp: '',
            description_jp: '',
            default_recipients_scope: 'all_engagement_members',
            has_threshold: false,
            threshold_unit: '',
          })}
        >
          + 通知種類を追加
        </Button>
      </div>

      <Card variant="default" padding="none">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
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
              <tr><td colSpan={5} style={{ ...tdMid, padding: space[5], textAlign: 'center' }}>読込中…</td></tr>
            ) : catalog.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdMid, padding: space[5], textAlign: 'center' }}>通知種類がありません</td></tr>
            ) : catalog.map(cat => {
              const eff = getEffective(cat);
              const busy = savingId === cat.id;
              return (
                <tr key={cat.id} style={{ borderTop: `1px solid ${BORDER}`, opacity: busy ? 0.6 : 1 }}>
                  <td style={tdBase}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: font.weight.semibold, color: NAVY }}>{cat.label_jp}</span>
                      {cat.is_system && (
                        <Badge variant="neutral" size="sm">システム</Badge>
                      )}
                    </div>
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
                    <div style={{ width: '100%', maxWidth: 200 }}>
                      <Select
                        size="sm"
                        value={eff.recipients_scope}
                        disabled={busy || !eff.enabled}
                        onChange={e => upsert(cat.id, { recipients_scope: e.target.value })}
                        options={SCOPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                        style={{ color: NAVY, fontSize: font.size.xs }}
                      />
                    </div>
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
                          style={{ padding: `4px ${space[2]}px`, borderRadius: radius.sm, border: `1px solid ${BORDER}`, fontSize: font.size.xs, width: 110, textAlign: 'right', fontFamily: font.family.mono }}
                        />
                        {cat.threshold_unit && <span style={{ fontSize: 10.5, color: TEXT_MID }}>{cat.threshold_unit}</span>}
                      </div>
                    ) : (
                      <span style={{ fontSize: 10.5, color: TEXT_MID }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>
                    {!cat.is_system && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingType({ isNew: false, ...cat })}
                        style={{ marginRight: 4, padding: '3px 10px', minHeight: 24, fontSize: 10.5 }}
                      >
                        編集
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteType(cat)}
                      title={cat.is_system ? 'この組織から削除する（復元可能）' : '完全に削除する'}
                      style={{ padding: '3px 10px', minHeight: 24, fontSize: 10.5 }}
                    >
                      削除
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {hiddenList.length > 0 && (
        <Card variant="subtle" padding="none" style={{ marginTop: space[3], padding: `${space[2.5]}px ${space[3] + 2}px` }}>
          <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: TEXT_MID, marginBottom: space[1.5] }}>削除済みの種類</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1.5] }}>
            {hiddenList.map(h => (
              <Button
                key={h.id}
                variant="outline"
                size="sm"
                onClick={() => restoreHidden(h.id)}
                style={{ padding: '3px 10px', minHeight: 24, fontSize: 10.5, borderRadius: 12 }}
              >
                {h.label_jp} を復元
              </Button>
            ))}
          </div>
        </Card>
      )}

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
    <div style={{ position: 'fixed', inset: 0, background: alpha('#000', 0.5), zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[5] }}>
      <div style={{ background: color.white, border: `1px solid ${BORDER}`, borderRadius: radius.md, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: space[6], fontFamily: font.family.sans, boxShadow: shadow.lg }}>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY, marginBottom: space[4] }}>
          {isNew ? '通知種類を追加' : '通知種類を編集'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <Input
            label="名称 *"
            size="sm"
            value={local.label_jp || ''}
            onChange={e => u('label_jp', e.target.value)}
            placeholder="例: 大型受注セレブレーション"
          />
          <div>
            <label style={{ display: 'block', fontSize: font.size.xs, fontWeight: font.weight.semibold, color: TEXT_MID, marginBottom: 4 }}>説明</label>
            <textarea value={local.description_jp || ''} onChange={e => u('description_jp', e.target.value)}
              rows={2}
              placeholder="どんな時に送る通知か"
              style={{ width: '100%', padding: `7px ${space[2.5]}px`, fontSize: font.size.sm, border: `1px solid ${BORDER}`, borderRadius: radius.sm, fontFamily: font.family.sans, boxSizing: 'border-box', resize: 'vertical', color: color.textDark }} />
          </div>
          <Select
            label="デフォルト受信者範囲"
            size="sm"
            value={local.default_recipients_scope || 'all_engagement_members'}
            onChange={e => u('default_recipients_scope', e.target.value)}
            options={SCOPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            style={{ color: NAVY }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <input id="hasThreshold" type="checkbox" checked={!!local.has_threshold}
              onChange={e => u('has_threshold', e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="hasThreshold" style={{ fontSize: font.size.sm, color: NAVY, cursor: 'pointer' }}>閾値（数値）を持つ</label>
          </div>
          {local.has_threshold && (
            <div style={{ width: 200 }}>
              <Input
                label="閾値の単位"
                size="sm"
                value={local.threshold_unit || ''}
                onChange={e => u('threshold_unit', e.target.value)}
                placeholder="例: 円 / 件"
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], marginTop: space[5] }}>
          <Button variant="secondary" size="sm" onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" size="sm" onClick={() => onSave(local)}>{isNew ? '追加' : '保存'}</Button>
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
      <div style={{ marginBottom: space[3] }}>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY, marginBottom: 4 }}>ランク管理</div>
        <div style={{ fontSize: font.size.xs, color: TEXT_MID }}>
          メンバーの階級と各ランクのデフォルトインセンティブ率を設定。行をドラッグで並び替え可。
        </div>
      </div>
      {loading ? <div style={{ padding: space[5], color: TEXT_MID, fontSize: font.size.sm }}>読込中…</div> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Card variant="default" padding="none">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
              <thead>
                <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ ...thBase, width: 18, padding: `${space[2.5]}px 2px` }}></th>
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
                        placeholder="例 24" style={{ ...inp80, fontFamily: font.family.mono }} />
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right' }}>
                      <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving} loading={saving} style={{ marginRight: 4 }}>{saving ? '…' : '追加'}</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setAdding(false); setNewForm({ name: '', default_incentive_rate: '' }); }} disabled={saving}>取消</Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </DndContext>
      )}
      {!adding && !loading && (
        <div style={{ marginTop: space[2.5] }}>
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>+ ランクを追加</Button>
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
      <td style={{ ...tdBase, textAlign: 'center', width: 18, padding: `${space[2]}px 2px`, cursor: 'grab', color: TEXT_MID, userSelect: 'none' }} {...listeners}>⋮⋮</td>
      <td style={{ ...tdMid, fontFamily: font.family.mono }}>{index + 1}</td>
      <td style={{ ...tdBase, color: NAVY, fontWeight: font.weight.medium }}>
        {isEditing
          ? <input value={editForm.name} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} style={inp200} />
          : r.name}
      </td>
      <td style={{ ...tdBase, textAlign: 'right', fontFamily: font.family.mono, color: NAVY }}>
        {isEditing
          ? <input type="number" step="0.1" value={editForm.default_incentive_rate}
              onChange={e => setEditForm(s => ({ ...s, default_incentive_rate: e.target.value }))}
              placeholder="例 22" style={{ ...inp80, fontFamily: font.family.mono }} />
          : (r.default_incentive_rate != null ? `${(Number(r.default_incentive_rate) * 100).toFixed(1).replace(/\.0$/, '')}%` : '—')}
      </td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        {isEditing ? (
          <>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} loading={saving} style={{ marginRight: 4 }}>保存</Button>
            <Button variant="secondary" size="sm" onClick={() => { setEditingId(null); setEditForm({ name: '', default_incentive_rate: '' }); }} disabled={saving}>取消</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => { setEditingId(r.id); setEditForm({ name: r.name, default_incentive_rate: r.default_incentive_rate != null ? (Number(r.default_incentive_rate) * 100).toString() : '' }); }} style={{ marginRight: 4 }}>編集</Button>
            <Button variant="danger" size="sm" onClick={() => handleDelete(r.id, r.name)}>削除</Button>
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
      <div style={{ marginBottom: space[3] }}>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY, marginBottom: 4 }}>ポジション管理</div>
        <div style={{ fontSize: font.size.xs, color: TEXT_MID }}>
          事業内のポジション（リーダー / 副リーダー / メンバーなど）。各事業の Members 画面のポジション dropdown に反映されます。事業ごとに独自の名称を設定可。行をドラッグで並び替え可。
        </div>
      </div>
      {loading ? <div style={{ padding: space[5], color: TEXT_MID, fontSize: font.size.sm }}>読込中…</div> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Card variant="default" padding="none">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm }}>
              <thead>
                <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ ...thBase, width: 18, padding: `${space[2.5]}px 2px` }}></th>
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
                      <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving} loading={saving} style={{ marginRight: 4 }}>{saving ? '…' : '追加'}</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setAdding(false); setNewName(''); }} disabled={saving}>取消</Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </DndContext>
      )}
      {!adding && !loading && (
        <div style={{ marginTop: space[2.5] }}>
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>+ ポジションを追加</Button>
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
      <td style={{ ...tdBase, textAlign: 'center', width: 18, padding: `${space[2]}px 2px`, cursor: 'grab', color: TEXT_MID, userSelect: 'none' }} {...listeners}>⋮⋮</td>
      <td style={{ ...tdMid, fontFamily: font.family.mono }}>{index + 1}</td>
      <td style={{ ...tdBase, color: NAVY, fontWeight: font.weight.medium }}>
        {isEditing
          ? <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus style={inp200} />
          : r.name}
      </td>
      <td style={{ ...tdBase, textAlign: 'right' }}>
        {isEditing ? (
          <>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} loading={saving} style={{ marginRight: 4 }}>保存</Button>
            <Button variant="secondary" size="sm" onClick={() => { setEditingId(null); setEditName(''); }} disabled={saving}>取消</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => { setEditingId(r.id); setEditName(r.name); }} style={{ marginRight: 4 }}>編集</Button>
            <Button variant="danger" size="sm" onClick={() => handleDelete(r.id, r.name)}>削除</Button>
          </>
        )}
      </td>
    </tr>
  );
}

// styles
const thBase = { padding: `${space[2.5]}px ${space[3]}px`, fontSize: font.size.xs, fontWeight: font.weight.semibold, color: NAVY };
const tdBase = { padding: `${space[2]}px ${space[3]}px` };
const tdMid = { padding: `${space[2]}px ${space[3]}px`, color: TEXT_MID };
const inp200 = { padding: `5px ${space[2]}px`, borderRadius: radius.sm, border: `1px solid ${NAVY}`, fontSize: font.size.sm, width: 220, fontFamily: font.family.sans };
const inp80 = { padding: `5px ${space[2]}px`, borderRadius: radius.sm, border: `1px solid ${NAVY}`, fontSize: font.size.sm, width: 80, textAlign: 'right' };
