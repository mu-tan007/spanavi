import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';
import AlignmentContextMenu from '../common/AlignmentContextMenu';

import { getOrgId } from '../../lib/orgContext';

const NAVY = '#0D2247';

// Stripe席数同期（メンバー追加/削除後に呼ぶ）
async function syncSeatCount(newCount) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-update-seats`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ newSeatCount: newCount }),
      }
    );
  } catch (e) {
    console.warn('Stripe seat sync failed:', e.message);
  }
}
const GOLD = '#C8A84B';

const RANKS = ['トレーニー', 'プレイヤー', 'スパルタン', 'スーパースパルタン'];
const POSITIONS = ['代表', 'リーダー', 'サブリーダー', 'メンバー', 'インターン'];

const MEMBER_COLS = [
  { key: 'name', width: 100, align: 'left' },
  { key: 'role', width: 105, align: 'left' },
  { key: 'rank', width: 50, align: 'left' },
  { key: 'joinDate', width: 100, align: 'right' },
  { key: 'status', width: 140, align: 'center' },
  { key: 'mypage', width: 70, align: 'center' },
  { key: 'actions', width: 150, align: 'center' },
];

const btn = (variant = 'default', extra = {}) => ({
  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'Noto Sans JP'",
  border: variant === 'danger'  ? '1px solid #dc2626'
        : variant === 'primary' ? 'none'
        : variant === 'ghost'   ? `1px solid ${NAVY}40`
        : '1px solid #E5E5E5',
  background: variant === 'danger'  ? 'transparent'
            : variant === 'primary' ? NAVY
            : 'transparent',
  color: variant === 'danger'  ? '#dc2626'
       : variant === 'primary' ? '#fff'
       : variant === 'ghost'   ? NAVY
       : '#374151',
  ...extra,
});

export default function MemberManagement({ onToast, onViewMyPage, onDataRefetch }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', team: '', position: 'メンバー', rank: 'トレーニー', operation_start_date: '', email: '' });
  const [sendInvite, setSendInvite] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const { columns: memCols, contentMinWidth: memMinW, onResizeStart: memResize, onHeaderContextMenu: memCtxMenu, contextMenu: memCtx, setAlign: memSetAlign, resetAll: memReset, closeMenu: memClose } = useColumnConfig('memberMgmt', MEMBER_COLS);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('members')
      .select('id, name, email, team, position, rank, operation_start_date, start_date, is_active, zoom_user_id')
      .eq('org_id', getOrgId());
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
    const newMembers = members.filter(m => m.id !== id);
    setMembers(newMembers);
    setDeleteConfirm(null);
    onToast('削除しました ✓');
    syncSeatCount(newMembers.length);
    if (onDataRefetch) onDataRefetch();
  };

  const resendInvite = async (member) => {
    if (!member.email) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: member.email,
            name: member.name,
            resend: true,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) { onToast(result.error || '招待メール送信に失敗しました', 'error'); return; }
      onToast(`${member.name} に招待メールを送信しました ✓`);
    } catch (err) {
      onToast('招待メール送信に失敗しました: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addMember = async () => {
    if (!addForm.name.trim()) { onToast('氏名を入力してください', 'error'); return; }
    if (sendInvite && !addForm.email.trim()) { onToast('招待メール送信にはメールアドレスが必要です', 'error'); return; }
    setSaving(true);

    if (sendInvite && addForm.email.trim()) {
      // Edge Function経由でメンバー追加 + 招待メール送信
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              email: addForm.email.trim(),
              name: addForm.name.trim(),
              orgId: getOrgId(),
              role: 'caller',
              rank: addForm.rank,
              position: addForm.position,
            }),
          }
        );
        const result = await res.json();
        if (!res.ok) { onToast(result.error || '招待に失敗しました', 'error'); setSaving(false); return; }
        onToast(`${addForm.email.trim()} に招待メールを送信しました ✓`);
      } catch (err) {
        onToast('招待に失敗しました: ' + err.message, 'error');
        setSaving(false);
        return;
      }
    } else {
      // 従来の直接INSERT（メール招待なし）
      const { data, error } = await supabase
        .from('members')
        .insert({
          org_id: getOrgId(),
          name: addForm.name.trim(),
          team: addForm.team || null,
          email: addForm.email.trim() || null,
          position: addForm.position,
          rank: addForm.rank,
          operation_start_date: addForm.operation_start_date || null,
          is_active: true,
        })
        .select()
        .single();
      if (error) { onToast('追加に失敗しました', 'error'); setSaving(false); return; }
      onToast('メンバーを追加しました ✓');
    }

    setSaving(false);
    setAddModal(false);
    setAddForm({ name: '', team: '', position: 'メンバー', rank: 'トレーニー', operation_start_date: '', email: '' });
    setSendInvite(true);
    await load();
    syncSeatCount(members.length + 1);
    if (onDataRefetch) onDataRefetch();
  };

  // チーム別グループ化（入社日順にソート）
  const grouped = (() => {
    const sorted = [...members].sort((a, b) => {
      const da = a.operation_start_date || a.start_date || '';
      const db = b.operation_start_date || b.start_date || '';
      return da < db ? -1 : da > db ? 1 : 0;
    });
    const map = new Map();
    for (const m of sorted) {
      if (!m.team) continue; // チーム未設定は非表示
      if (!map.has(m.team)) map.set(m.team, []);
      map.get(m.team).push(m);
    }
    // チーム名でソート（「未設定」は末尾）
    return [...map.entries()].sort(([a], [b]) => {
      if (a === '（チーム未設定）') return 1;
      if (b === '（チーム未設定）') return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  })();

  const th = { padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#ffffff', background: '#0D2247', borderBottom: '2px solid #0D2247' };
  const thPad  = { 'ランク': '8px 2px 8px 6px', '入社日': '8px 6px 8px 2px' };
  const td = { padding: '8px 16px', fontSize: 11, color: '#374151', borderBottom: '1px solid #E5E7EB', verticalAlign: 'middle' };
  const COLS = ['氏名', '役職', 'ランク', '入社日', 'ステータス', 'マイページ', '操作'];

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(([team, teamMembers]) => (
            <div key={team} style={{ background: '#fff', borderRadius: 4, border: '1px solid #E5E5E5', overflowX: 'auto', overflowY: 'hidden' }}>
              <div style={{ minWidth: memMinW }}>
              {/* チームヘッダー */}
              <div style={{
                padding: '10px 16px',
                background: NAVY,
                borderLeft: '3px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {team}
                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>({teamMembers.length}名)</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {COLS.map((h, i) => <th key={h} onContextMenu={e => memCtxMenu(e, i)} style={{ ...th, textAlign: memCols[i].align, width: memCols[i].width, maxWidth: memCols[i].width, ...(thPad[h] ? { padding: thPad[h] } : {}), position: 'relative' }}>{h}<ColumnResizeHandle colIndex={i} onResizeStart={memResize} /></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((m, idx) => {
                      const isEditing = editId === m.id;
                      return (
                        <tr
                          key={m.id}
                          onMouseEnter={() => setHoveredRow(m.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          style={{
                            background: isEditing ? NAVY + '06' : hoveredRow === m.id ? '#EAF4FF' : idx % 2 === 0 ? '#fff' : '#F8F9FA',
                            borderLeft: hoveredRow === m.id && !isEditing ? `3px solid ${NAVY}` : '3px solid transparent',
                            transition: 'background 0.12s, border-color 0.12s',
                          }}
                        >
                          <td style={{ ...td, textAlign: memCols[0].align, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ fontWeight: 600 }}>{m.name}</span></td>
                          <td style={{ ...td, textAlign: memCols[1].align, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isEditing ? (
                              <select value={editForm.position} onChange={e => setEditForm(p => ({ ...p, position: e.target.value }))}
                                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12 }}>
                                {POSITIONS.map(p => <option key={p}>{p}</option>)}
                              </select>
                            ) : m.position || '—'}
                          </td>
                          <td style={{ ...td, textAlign: memCols[2].align, padding: '8px 2px 8px 6px' }}>
                            {isEditing ? (
                              <select value={editForm.rank} onChange={e => setEditForm(p => ({ ...p, rank: e.target.value }))}
                                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12 }}>
                                {RANKS.map(r => <option key={r}>{r}</option>)}
                              </select>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 600,
                                color: m.rank === 'スーパースパルタン' ? '#b7791f' : m.rank === 'スパルタン' ? '#2E844A' : m.rank === 'プレイヤー' ? '#0176D3' : '#374151', background: 'transparent',
                              }}>{m.rank || 'トレーニー'}</span>
                            )}
                          </td>
                          <td style={{ ...td, padding: '8px 6px 8px 2px', textAlign: memCols[3].align }}>
                            {isEditing ? (
                              <input type="date" value={editForm.operation_start_date} onChange={e => setEditForm(p => ({ ...p, operation_start_date: e.target.value }))}
                                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12 }} />
                            ) : (m.operation_start_date || m.start_date || '—')}
                          </td>
                          <td style={{ ...td, textAlign: memCols[4].align }}>
                            {isEditing ? (
                              <select value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.value === 'active' }))}
                                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #E5E5E5', fontSize: 12 }}>
                                <option value="active">稼働中</option>
                                <option value="inactive">停止</option>
                              </select>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 600,
                                borderLeft: `3px solid ${m.is_active !== false ? '#2E844A' : '#DC2626'}`, paddingLeft: 8,
                                color: m.is_active !== false ? '#2E844A' : '#DC2626', background: 'transparent', border: 'none' }}>
                                {m.is_active !== false ? '稼働中' : '停止'}
                              </span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: memCols[5].align }}>
                            {onViewMyPage && (
                              <button
                                onClick={() => onViewMyPage(m.name)}
                                style={btn('default', { fontSize: 11, padding: '3px 10px', color: NAVY, borderColor: NAVY + '40' })}
                              >
                                表示 →
                              </button>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: memCols[6].align, whiteSpace: 'nowrap' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                <button onClick={() => saveEdit(m.id)} disabled={saving} style={btn('primary')}>保存</button>
                                <button onClick={() => setEditId(null)} style={btn()}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                <button onClick={() => startEdit(m)} style={btn('ghost')}>編集</button>
                                {m.email && !m.email.includes('.spanavi.internal') && (
                                  <button onClick={() => resendInvite(m)} disabled={saving} style={btn('ghost')}>招待</button>
                                )}
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
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新規追加モーダル */}
      {addModal && (
        <div onClick={() => setAddModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, padding: '28px 32px', width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 20 }}>新規メンバー追加</div>
            {[
              { label: '氏名', key: 'name', type: 'text', placeholder: '例：山田太郎' },
              { label: 'メールアドレス', key: 'email', type: 'email', placeholder: '例：user@example.com' },
              { label: 'チーム', key: 'team', type: 'text', placeholder: '例：Aチーム' },
              { label: '入社日', key: 'operation_start_date', type: 'date' },
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
            {addForm.email.trim() && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={sendInvite}
                    onChange={e => setSendInvite(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  招待メールを送信する
                </label>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, marginLeft: 24 }}>
                  パスワード設定用のリンクがメールで届きます
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setAddModal(false)} style={btn()}>キャンセル</button>
              <button onClick={addMember} disabled={saving} style={btn('primary', { padding: '7px 20px' })}>{saving ? '処理中...' : sendInvite && addForm.email.trim() ? '招待する' : '追加する'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, padding: '28px 32px', width: 360, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
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

      <AlignmentContextMenu
        contextMenu={memCtx}
        onAlign={memSetAlign}
        onReset={memReset}
        onClose={memClose}
      />
    </div>
  );
}
