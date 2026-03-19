import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const NAVY = '#0D2247';
const GOLD = '#C8A84B';
const ORG_ID = 'a0000000-0000-0000-0000-000000000001';

const RANKS = ['トレーニー', 'プレイヤー', 'スパルタン', 'スーパースパルタン'];
const POSITIONS = ['代表', 'リーダー', 'サブリーダー', 'メンバー', 'インターン'];

const btn = (variant = 'default', extra = {}) => ({
  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'Noto Sans JP'",
  border: variant === 'danger' ? '1px solid #fca5a5'
        : variant === 'primary' ? 'none'
        : '1px solid #E5E5E5',
  background: variant === 'danger' ? '#fee2e2'
            : variant === 'primary' ? NAVY
            : '#fff',
  color: variant === 'danger' ? '#dc2626'
       : variant === 'primary' ? '#fff'
       : '#374151',
  ...extra,
});

export default function MemberManagement({ onToast, onViewMyPage }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', team: '', position: 'メンバー', rank: 'トレーニー', operation_start_date: '' });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('members')
      .select('id, name, team, position, rank, operation_start_date, is_active, zoom_user_id')
      .eq('org_id', ORG_ID)
      .order('name');
    if (error) { onToast('メンバーの取得に失敗しました', 'error'); }
    else { setMembers(data || []); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (m) => {
    setEditId(m.id);
    setEditForm({
      team: m.team || '',
      position: m.position || 'メンバー',
      rank: m.rank || 'トレーニー',
      operation_start_date: m.operation_start_date || '',
      is_active: m.is_active !== false,
    });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    const { error } = await supabase
      .from('members')
      .update({
        team: editForm.team,
        position: editForm.position,
        rank: editForm.rank,
        operation_start_date: editForm.operation_start_date || null,
        is_active: editForm.is_active,
      })
      .eq('id', id);
    setSaving(false);
    if (error) { onToast('保存に失敗しました', 'error'); return; }
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...editForm } : m));
    setEditId(null);
    onToast('保存しました ✓');
  };

  const deleteMember = async (id) => {
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) { onToast('削除に失敗しました', 'error'); return; }
    setMembers(prev => prev.filter(m => m.id !== id));
    setDeleteConfirm(null);
    onToast('削除しました ✓');
  };

  const addMember = async () => {
    if (!addForm.name.trim()) { onToast('氏名を入力してください', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from('members')
      .insert({
        org_id: ORG_ID,
        name: addForm.name.trim(),
        team: addForm.team || null,
        position: addForm.position,
        rank: addForm.rank,
        operation_start_date: addForm.operation_start_date || null,
        is_active: true,
      })
      .select()
      .single();
    setSaving(false);
    if (error) { onToast('追加に失敗しました', 'error'); return; }
    setMembers(prev => [...prev, data]);
    setAddModal(false);
    setAddForm({ name: '', team: '', position: 'メンバー', rank: 'トレーニー', operation_start_date: '' });
    onToast('メンバーを追加しました ✓');
  };

  const th = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F9FAFB', borderBottom: '1px solid #E5E5E5', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const td = { padding: '8px 12px', fontSize: 13, color: '#374151', borderBottom: '1px solid #F3F4F6', verticalAlign: 'middle' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>メンバー一覧（{members.length}名）</div>
        <button onClick={() => setAddModal(true)} style={{ ...btn('primary'), padding: '7px 16px', fontSize: 13 }}>
          ＋ 新規追加
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>読み込み中...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E5E5', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['氏名', '役職', 'ランク', 'チーム', '稼働開始日', 'ステータス', 'マイページ', '操作'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const isEditing = editId === m.id;
                return (
                  <tr key={m.id} style={{ background: isEditing ? '#F0F7FF' : 'transparent' }}>
                    <td style={td}><span style={{ fontWeight: 600 }}>{m.name}</span></td>
                    <td style={td}>
                      {isEditing ? (
                        <select value={editForm.position} onChange={e => setEditForm(p => ({ ...p, position: e.target.value }))}
                          style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12 }}>
                          {POSITIONS.map(p => <option key={p}>{p}</option>)}
                        </select>
                      ) : m.position || '—'}
                    </td>
                    <td style={td}>
                      {isEditing ? (
                        <select value={editForm.rank} onChange={e => setEditForm(p => ({ ...p, rank: e.target.value }))}
                          style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12 }}>
                          {RANKS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: m.rank === 'スーパースパルタン' ? GOLD + '22' : m.rank === 'スパルタン' ? '#EDE9FE' : m.rank === 'プレイヤー' ? '#DBEAFE' : '#F3F4F6',
                          color: m.rank === 'スーパースパルタン' ? '#92400E' : m.rank === 'スパルタン' ? '#5B21B6' : m.rank === 'プレイヤー' ? '#1E40AF' : '#374151',
                        }}>{m.rank || 'トレーニー'}</span>
                      )}
                    </td>
                    <td style={td}>
                      {isEditing ? (
                        <input value={editForm.team} onChange={e => setEditForm(p => ({ ...p, team: e.target.value }))}
                          style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12, width: 100 }} />
                      ) : m.team || '—'}
                    </td>
                    <td style={td}>
                      {isEditing ? (
                        <input type="date" value={editForm.operation_start_date} onChange={e => setEditForm(p => ({ ...p, operation_start_date: e.target.value }))}
                          style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12 }} />
                      ) : m.operation_start_date || '—'}
                    </td>
                    <td style={td}>
                      {isEditing ? (
                        <select value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.value === 'active' }))}
                          style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12 }}>
                          <option value="active">稼働中</option>
                          <option value="inactive">停止</option>
                        </select>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: m.is_active !== false ? '#D1FAE5' : '#FEE2E2',
                          color: m.is_active !== false ? '#065F46' : '#DC2626' }}>
                          {m.is_active !== false ? '稼働中' : '停止'}
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      {onViewMyPage && (
                        <button
                          onClick={() => onViewMyPage(m.name)}
                          style={btn('default', { fontSize: 11, padding: '3px 10px', color: NAVY, borderColor: NAVY + '40' })}
                        >
                          表示 →
                        </button>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(m.id)} disabled={saving} style={btn('primary')}>保存</button>
                          <button onClick={() => setEditId(null)} style={btn()}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(m)} style={btn()}>編集</button>
                          <button onClick={() => setDeleteConfirm(m)} style={btn('danger')}>削除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 新規追加モーダル */}
      {addModal && (
        <div onClick={() => setAddModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 20 }}>新規メンバー追加</div>
            {[
              { label: '氏名', key: 'name', type: 'text', placeholder: '例：山田太郎' },
              { label: 'チーム', key: 'team', type: 'text', placeholder: '例：Aチーム' },
              { label: '稼働開始日', key: 'operation_start_date', type: 'date' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} value={addForm[f.key]} placeholder={f.placeholder}
                  onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #E5E5E5', fontSize: 13 }} />
              </div>
            ))}
            {[
              { label: '役職', key: 'position', options: POSITIONS },
              { label: 'ランク', key: 'rank', options: RANKS },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{f.label}</label>
                <select value={addForm[f.key]} onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #E5E5E5', fontSize: 13 }}>
                  {f.options.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setAddModal(false)} style={btn()}>キャンセル</button>
              <button onClick={addMember} disabled={saving} style={btn('primary', { padding: '7px 20px' })}>追加する</button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#DC2626', marginBottom: 12 }}>メンバー削除の確認</div>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 20 }}>
              「{deleteConfirm.name}」を削除しますか？この操作は元に戻せません。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={btn()}>キャンセル</button>
              <button onClick={() => deleteMember(deleteConfirm.id)} style={btn('danger', { padding: '7px 20px' })}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
