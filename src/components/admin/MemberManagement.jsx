import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select } from '../ui';
import useColumnConfig from '../../hooks/useColumnConfig';
import ColumnResizeHandle from '../common/ColumnResizeHandle';

import { getOrgId } from '../../lib/orgContext';

const NAVY = color.navy;

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

// 既存の編集行内インラインボタン用ヘルパー（Button部品で代替できる箇所は Button に移行済）
const btn = (variant = 'default', extra = {}) => ({
  padding: `${space[1]}px ${space[3]}px`, borderRadius: radius.lg, fontSize: font.size.sm, fontWeight: font.weight.semibold,
  cursor: 'pointer', fontFamily: font.family.sans,
  border: variant === 'danger'  ? `1px solid ${color.danger}`
        : variant === 'primary' ? 'none'
        : variant === 'ghost'   ? `1px solid ${alpha(NAVY, 0.25)}`
        : `1px solid ${color.border}`,
  background: variant === 'danger'  ? 'transparent'
            : variant === 'primary' ? NAVY
            : 'transparent',
  color: variant === 'danger'  ? color.danger
       : variant === 'primary' ? color.white
       : variant === 'ghost'   ? NAVY
       : color.gray700,
  ...extra,
});

export default function MemberManagement({ onToast, onViewMyPage, onDataRefetch }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', team: '', position: 'メンバー', rank: 'トレーニー', operation_start_date: '', email: '', university: '', grade: '', referrer_name: '' });
  const [sendInvite, setSendInvite] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const { columns: memCols, contentMinWidth: memMinW, onResizeStart: memResize } = useColumnConfig('memberMgmt', MEMBER_COLS);

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
              rank: addForm.rank,
              position: addForm.position,
              team: addForm.team || null,
              university: addForm.university || null,
              grade: addForm.grade || null,
              referrer_name: addForm.referrer_name || null,
              operation_start_date: addForm.operation_start_date || null,
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
          university: addForm.university || null,
          grade: addForm.grade ? parseInt(addForm.grade) : null,
          referrer_name: addForm.referrer_name || null,
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
    setAddForm({ name: '', team: '', position: 'メンバー', rank: 'トレーニー', operation_start_date: '', email: '', university: '', grade: '', referrer_name: '' });
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

  // Sourcing Members ページとデザイン統一: クリーム背景の header + ネイビー文字
  const th = { padding: `${space[2.5]}px ${space[4]}px`, textAlign: 'left', fontSize: font.size.xs, fontWeight: font.weight.semibold, color: NAVY, background: '#F8F8F8', letterSpacing: font.letterSpacing.wide };
  const thPad  = { 'ランク': '10px 6px', '入社日': '10px 6px' };
  const td = { padding: `${space[2]}px ${space[4]}px`, fontSize: font.size.sm, color: '#181818', borderBottom: `1px solid ${color.gray100}`, verticalAlign: 'middle' };
  const COLS = ['氏名', '役職', 'ランク', '入社日', 'ステータス', 'マイページ', '操作'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: NAVY }}>メンバー一覧（{members.length}名）</div>
        <Button variant="primary" onClick={() => setAddModal(true)}>
          ＋ 新規追加
        </Button>
      </div>

      {loading ? (
        <div style={{ padding: space[10], textAlign: 'center', color: color.gray400 }}>読み込み中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
          {grouped.map(([team, teamMembers]) => (
            <div key={team} style={{ background: color.white, borderRadius: radius.md, border: `1px solid ${color.border}`, overflowX: 'auto', overflowY: 'hidden' }}>
              <div style={{ minWidth: memMinW }}>
              {/* チームヘッダー */}
              <div style={{
                padding: `${space[2.5]}px ${space[4]}px`,
                background: NAVY,
                borderLeft: `3px solid ${alpha(color.white, 0.3)}`,
                color: color.white,
                fontSize: font.size.sm + 1,
                fontWeight: font.weight.bold,
                display: 'flex',
                alignItems: 'center',
                gap: space[2],
              }}>
                {team}
                <span style={{ fontSize: font.size.xs, fontWeight: font.weight.normal, opacity: 0.8 }}>({teamMembers.length}名)</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {COLS.map((h, i) => <th key={h} style={{ ...th, textAlign: memCols[i].align, width: memCols[i].width, maxWidth: memCols[i].width, ...(thPad[h] ? { padding: thPad[h] } : {}), position: 'relative' }}>{h}<ColumnResizeHandle colIndex={i} onResizeStart={memResize} /></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((m, idx) => {
                      const isEditing = editId === m.id;
                      const compactSelect = { padding: `3px ${space[1.5]}px`, borderRadius: radius.md, border: `1px solid ${color.border}`, fontSize: font.size.sm, fontFamily: font.family.sans, color: color.textDark, background: color.white };
                      return (
                        <tr
                          key={m.id}
                          onMouseEnter={() => setHoveredRow(m.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                          style={{
                            // Sourcing Members と同じ白背景 + ホバーのみ薄色
                            background: isEditing ? alpha(NAVY, 0.025) : hoveredRow === m.id ? '#F8F8F8' : color.white,
                            transition: 'background 0.12s',
                          }}
                        >
                          <td style={{ ...td, textAlign: memCols[0].align, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ fontWeight: font.weight.semibold }}>{m.name}</span></td>
                          <td style={{ ...td, textAlign: memCols[1].align, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isEditing ? (
                              <select value={editForm.position} onChange={e => setEditForm(p => ({ ...p, position: e.target.value }))}
                                style={compactSelect}>
                                {POSITIONS.map(p => <option key={p}>{p}</option>)}
                              </select>
                            ) : m.position || '—'}
                          </td>
                          <td style={{ ...td, textAlign: memCols[2].align, padding: `${space[2]}px 2px ${space[2]}px ${space[1.5]}px` }}>
                            {isEditing ? (
                              <select value={editForm.rank} onChange={e => setEditForm(p => ({ ...p, rank: e.target.value }))}
                                style={compactSelect}>
                                {RANKS.map(r => <option key={r}>{r}</option>)}
                              </select>
                            ) : (
                              <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold,
                                color: m.rank === 'スーパースパルタン' ? '#b7791f' : m.rank === 'スパルタン' ? color.success : m.rank === 'プレイヤー' ? color.navyLight : color.gray700, background: 'transparent',
                              }}>{m.rank || 'トレーニー'}</span>
                            )}
                          </td>
                          <td style={{ ...td, padding: `${space[2]}px ${space[1.5]}px ${space[2]}px 2px`, textAlign: memCols[3].align }}>
                            {isEditing ? (
                              <input type="date" value={editForm.operation_start_date} onChange={e => setEditForm(p => ({ ...p, operation_start_date: e.target.value }))}
                                style={compactSelect} />
                            ) : (m.operation_start_date || m.start_date || '—')}
                          </td>
                          <td style={{ ...td, textAlign: memCols[4].align }}>
                            {isEditing ? (
                              <select value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.value === 'active' }))}
                                style={compactSelect}>
                                <option value="active">稼働中</option>
                                <option value="inactive">停止</option>
                              </select>
                            ) : (
                              <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold,
                                borderLeft: `3px solid ${m.is_active !== false ? color.success : color.danger}`, paddingLeft: space[2],
                                color: m.is_active !== false ? color.success : color.danger, background: 'transparent', border: 'none' }}>
                                {m.is_active !== false ? '稼働中' : '停止'}
                              </span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: memCols[5].align }}>
                            {onViewMyPage && (
                              <button
                                onClick={() => onViewMyPage(m.name)}
                                style={btn('default', { fontSize: font.size.xs, padding: `3px ${space[2.5]}px`, color: NAVY, borderColor: alpha(NAVY, 0.25) })}
                              >
                                表示 →
                              </button>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: memCols[6].align, whiteSpace: 'nowrap' }}>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: space[1.5], justifyContent: 'center' }}>
                                <button onClick={() => saveEdit(m.id)} disabled={saving} style={btn('primary')}>保存</button>
                                <button onClick={() => setEditId(null)} style={btn()}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: space[1.5], justifyContent: 'center' }}>
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
        <div onClick={() => setAddModal(false)} style={{ position: 'fixed', inset: 0, background: alpha('#000', 0.4), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: color.white, borderRadius: radius.md, padding: `${space[8] - 4}px ${space[8]}px`, width: 400, boxShadow: shadow.lg }}>
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: NAVY, marginBottom: space[5] }}>新規メンバー追加</div>
            {[
              { label: '氏名 *', key: 'name', type: 'text', placeholder: '例：山田太郎' },
              { label: 'メールアドレス *', key: 'email', type: 'email', placeholder: '例：user@example.com' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: space[3] + 2 }}>
                <Input
                  label={f.label}
                  type={f.type}
                  value={addForm[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            {[
              { label: 'チーム', key: 'team', options: [...new Set(members.map(m => m.team).filter(Boolean))] },
              { label: '役職', key: 'position', options: POSITIONS },
              { label: 'ランク', key: 'rank', options: RANKS },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: space[3] + 2 }}>
                <Select
                  label={f.label}
                  value={addForm[f.key]}
                  onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                  options={[
                    { value: '', label: '選択してください' },
                    ...f.options.map(o => ({ value: o, label: o })),
                  ]}
                />
              </div>
            ))}
            {[
              { label: '大学名', key: 'university', type: 'text', placeholder: '例：東京大学' },
              { label: '学年', key: 'grade', type: 'number', placeholder: '例：2' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: space[3] + 2 }}>
                <Input
                  label={f.label}
                  type={f.type}
                  value={addForm[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <div style={{ marginBottom: space[3] + 2 }}>
              <Select
                label="紹介者"
                value={addForm.referrer_name}
                onChange={e => setAddForm(p => ({ ...p, referrer_name: e.target.value }))}
                options={[
                  { value: '', label: '選択してください' },
                  ...members.filter(m => m.name).map(m => ({ value: m.name, label: m.name })),
                ]}
              />
            </div>
            {[
              { label: '入社日', key: 'operation_start_date', type: 'date' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: space[3] + 2 }}>
                <Input
                  label={f.label}
                  type={f.type}
                  value={addForm[f.key]}
                  placeholder={f.placeholder}
                  onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            {addForm.email.trim() && (
              <div style={{ marginBottom: space[3] + 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm + 1, color: color.gray700, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={sendInvite}
                    onChange={e => setSendInvite(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  招待メールを送信する
                </label>
                <div style={{ fontSize: font.size.xs, color: color.gray400, marginTop: 4, marginLeft: space[6] }}>
                  パスワード設定用のリンクがメールで届きます
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: space[2.5], justifyContent: 'flex-end', marginTop: space[5] }}>
              <Button variant="outline" onClick={() => setAddModal(false)}>キャンセル</Button>
              <Button variant="primary" onClick={addMember} loading={saving} disabled={saving}>{saving ? '処理中...' : sendInvite && addForm.email.trim() ? '招待する' : '追加する'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: alpha('#000', 0.4), display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: color.white, borderRadius: radius.md, padding: `${space[8] - 4}px ${space[8]}px`, width: 360, boxShadow: shadow.lg }}>
            <div style={{ fontSize: font.size.md + 1, fontWeight: font.weight.bold, color: color.danger, marginBottom: space[3] }}>メンバー削除の確認</div>
            <p style={{ fontSize: font.size.sm + 1, color: color.gray700, marginBottom: space[5] }}>
              「{deleteConfirm.name}」を削除しますか？この操作は元に戻せません。
            </p>
            <div style={{ display: 'flex', gap: space[2.5], justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>キャンセル</Button>
              <Button variant="danger" onClick={() => deleteMember(deleteConfirm.id)}>削除する</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
