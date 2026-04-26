import { useState, useEffect, useCallback, useMemo } from 'react';
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

  const move = async (id, dir) => {
    const idx = rows.findIndex(r => r.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    const a = rows[idx]; const b = rows[swapIdx];
    await Promise.all([
      supabase.from('engagement_ranks').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('engagement_ranks').update({ display_order: a.display_order }).eq('id', b.id),
    ]);
    await load();
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>ランク管理</div>
        <div style={{ fontSize: 11, color: TEXT_MID }}>
          メンバーの階級と各ランクのデフォルトインセンティブ率を設定
        </div>
      </div>
      {loading ? <div style={{ padding: 20, color: TEXT_MID, fontSize: 12 }}>読込中…</div> : (
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
                <th style={th60}>順序</th>
                <th style={thLeft}>ランク名</th>
                <th style={thRight}>デフォルト率</th>
                <th style={thRight200}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <td style={tdMid}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => move(r.id, -1)} disabled={i === 0} style={{ ...iconBtn, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                      <button onClick={() => move(r.id, 1)} disabled={i === rows.length - 1} style={{ ...iconBtn, opacity: i === rows.length - 1 ? 0.3 : 1 }}>↓</button>
                    </div>
                  </td>
                  <td style={tdName}>
                    {editingId === r.id
                      ? <input value={editForm.name} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} style={inp200} />
                      : r.name}
                  </td>
                  <td style={tdRight}>
                    {editingId === r.id
                      ? <input type="number" step="0.1" value={editForm.default_incentive_rate}
                          onChange={e => setEditForm(s => ({ ...s, default_incentive_rate: e.target.value }))}
                          placeholder="例 22" style={{ ...inp80, fontFamily: "'JetBrains Mono'" }} />
                      : (r.default_incentive_rate != null ? `${(Number(r.default_incentive_rate) * 100).toFixed(1).replace(/\.0$/, '')}%` : '—')}
                  </td>
                  <td style={tdRight}>
                    {editingId === r.id ? (
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
              ))}
              {adding && (
                <tr style={{ background: '#FFFBEA' }}>
                  <td style={tdMid}>—</td>
                  <td style={tdName}>
                    <input value={newForm.name} onChange={e => setNewForm(s => ({ ...s, name: e.target.value }))}
                      placeholder="例 シニアプレイヤー" autoFocus style={inp200} />
                  </td>
                  <td style={tdRight}>
                    <input type="number" step="0.1" value={newForm.default_incentive_rate}
                      onChange={e => setNewForm(s => ({ ...s, default_incentive_rate: e.target.value }))}
                      placeholder="例 24" style={{ ...inp80, fontFamily: "'JetBrains Mono'" }} />
                  </td>
                  <td style={tdRight}>
                    <button onClick={handleAdd} disabled={saving} style={primarySmallBtn}>{saving ? '…' : '追加'}</button>
                    <button onClick={() => { setAdding(false); setNewForm({ name: '', default_incentive_rate: '' }); }} disabled={saving} style={secondarySmallBtn}>取消</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!adding && !loading && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setAdding(true)} style={addBtn}>+ ランクを追加</button>
        </div>
      )}
    </div>
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

  const move = async (id, dir) => {
    const idx = rows.findIndex(r => r.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    const a = rows[idx]; const b = rows[swapIdx];
    await Promise.all([
      supabase.from('engagement_roles').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('engagement_roles').update({ display_order: a.display_order }).eq('id', b.id),
    ]);
    await load();
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>役割管理</div>
        <div style={{ fontSize: 11, color: TEXT_MID }}>
          チーム内の役割（リーダー / 副リーダー / メンバーなど）。事業ごとに独自の名称を設定可
        </div>
      </div>
      {loading ? <div style={{ padding: 20, color: TEXT_MID, fontSize: 12 }}>読込中…</div> : (
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8F8F8', borderBottom: `1px solid ${BORDER}` }}>
                <th style={th60}>順序</th>
                <th style={thLeft}>役割名</th>
                <th style={thRight200}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <td style={tdMid}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => move(r.id, -1)} disabled={i === 0} style={{ ...iconBtn, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                      <button onClick={() => move(r.id, 1)} disabled={i === rows.length - 1} style={{ ...iconBtn, opacity: i === rows.length - 1 ? 0.3 : 1 }}>↓</button>
                    </div>
                  </td>
                  <td style={tdName}>
                    {editingId === r.id
                      ? <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus style={inp200} />
                      : r.name}
                  </td>
                  <td style={tdRight}>
                    {editingId === r.id ? (
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
              ))}
              {adding && (
                <tr style={{ background: '#FFFBEA' }}>
                  <td style={tdMid}>—</td>
                  <td style={tdName}>
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="例 マネージャー" autoFocus style={inp200} />
                  </td>
                  <td style={tdRight}>
                    <button onClick={handleAdd} disabled={saving} style={primarySmallBtn}>{saving ? '…' : '追加'}</button>
                    <button onClick={() => { setAdding(false); setNewName(''); }} disabled={saving} style={secondarySmallBtn}>取消</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!adding && !loading && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setAdding(true)} style={addBtn}>+ 役割を追加</button>
        </div>
      )}
    </div>
  );
}

// styles
const th60 = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: NAVY, width: 80 };
const thLeft = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: NAVY };
const thRight = { padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: NAVY };
const thRight200 = { padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: NAVY, width: 200 };
const tdMid = { padding: '8px 12px', color: TEXT_MID };
const tdName = { padding: '8px 12px', color: NAVY, fontWeight: 500 };
const tdRight = { padding: '8px 12px', textAlign: 'right' };
const inp200 = { padding: '5px 8px', borderRadius: 3, border: `1px solid ${NAVY}`, fontSize: 12, width: 220, fontFamily: "'Noto Sans JP'" };
const inp80 = { padding: '5px 8px', borderRadius: 3, border: `1px solid ${NAVY}`, fontSize: 12, width: 80, textAlign: 'right' };
const iconBtn = { padding: '2px 8px', fontSize: 11, background: '#fff', color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 2, cursor: 'pointer' };
const primarySmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'" };
const secondarySmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', marginRight: 4, fontFamily: "'Noto Sans JP'" };
const dangerSmallBtn = { padding: '4px 12px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" };
const addBtn = { padding: '7px 16px', fontSize: 12, fontWeight: 600, background: NAVY, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontFamily: "'Noto Sans JP'" };
