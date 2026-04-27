import React, { useMemo, useState, useEffect } from 'react';
import { C } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useEngagements } from '../../hooks/useEngagements';
import { useAllMembersWithEngagements } from '../../hooks/useMemberEngagements';
import { deactivateMember, updateMemberProfile, updateMember } from '../../lib/supabaseWrite';
import { getOrgId } from '../../lib/orgContext';
import PageHeader from '../common/PageHeader';
import { useMemberProfile } from '../common/MemberProfileDrawer';

// POSITION_OPTIONS は organization_positions テーブルから動的取得
// （fallback: テーブル未設定時のデフォルト）
const POSITION_FALLBACK = ['代表取締役', '取締役', '執行役員', '監査役'];

async function syncSeatCount(newCount) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-update-seats`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ newSeatCount: newCount }),
      }
    );
  } catch (e) {
    console.warn('Stripe seat sync failed:', e.message);
  }
}

// MASP タブの「Members」ページ。全社の従業員一覧を編集する。
export default function MASPMembersView({ isAdmin }) {
  const { engagements } = useEngagements();
  const { openProfile } = useMemberProfile();
  const { members, assignments, teamsByEngagement, memberTeam, loading, toggleAssignment, assignMemberToTeam, refresh } = useAllMembersWithEngagements();
  const [positionOptions, setPositionOptions] = useState(POSITION_FALLBACK);
  useEffect(() => {
    supabase.from('organization_positions')
      .select('name')
      .eq('org_id', getOrgId())
      .order('display_order')
      .then(({ data }) => {
        if (data && data.length > 0) setPositionOptions(data.map(p => p.name));
      });
  }, []);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionMenuId, setActionMenuId] = useState(null); // 鉛筆メニューを開いている行 id

  // 外側クリック / ESC でメニュー閉じる
  useEffect(() => {
    if (!actionMenuId) return;
    const onDocClick = (e) => {
      if (!e.target.closest('[data-action-menu-root]')) setActionMenuId(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setActionMenuId(null); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionMenuId]);

  // 招待再送
  const [resendingId, setResendingId] = useState(null);
  const [resendResult, setResendResult] = useState(null);

  // 新規追加モーダル
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', email: '', phone_number: '', position: '', start_date: '',
  });
  const [addSendInvite, setAddSendInvite] = useState(true);
  const [addEngagementIds, setAddEngagementIds] = useState(new Set()); // 選択された engagement IDs
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);

  // MASP (virtual) を除外して表示する事業列
  const engagementCols = useMemo(
    () => engagements.filter(e => e.slug !== 'masp'),
    [engagements]
  );

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.name || '').toLowerCase().includes(q)
      || (m.email || '').toLowerCase().includes(q)
      || (m.position || '').toLowerCase().includes(q)
      || (m.team || '').toLowerCase().includes(q)
    );
  }, [members, filter]);

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditForm({
      name: m.name || '',
      email: m.email || '',
      phone_number: m.phone_number || '',
      position: m.position || '',
      start_date: m.start_date || '',
    });
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setSaveError(null);
    // ① 本人編集対応のフィールド (name/email/phone/start_date)
    const err1 = await updateMemberProfile(editingId, {
      name: editForm.name,
      email: editForm.email,
      phone_number: editForm.phone_number,
      start_date: editForm.start_date,
    });
    // ② position は別途更新（updateMember 経由）
    if (!err1) {
      const target = members.find(m => m.id === editingId);
      const err2 = await updateMember(editingId, {
        ...target,
        name: editForm.name,
        position: editForm.position,
        // updateMember は他フィールド全部期待するため一通り渡す
        team: target?.team,
        rank: target?.rank,
        rate: target?.incentive_rate,
        offer: target?.job_offer,
        operationStartDate: target?.operation_start_date,
        referrerName: target?.referrer_name,
        zoomUserId: target?.zoom_user_id,
        zoomPhoneNumber: target?.zoom_phone_number,
        year: target?.grade,
        university: target?.university,
        role: editForm.position,
      });
      if (err2) {
        setSaveError(err2.message || '保存に失敗しました');
        setSaving(false);
        return;
      }
    } else {
      setSaveError(err1.message || '保存に失敗しました');
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditingId(null);
    setEditForm({});
    await refresh?.();
  };

  const handleResendInvite = async (m) => {
    if (!m.email) {
      setResendResult({ type: 'error', message: 'メールアドレスが未登録です' });
      setTimeout(() => setResendResult(null), 5000);
      return;
    }
    setResendingId(m.id);
    setResendResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ email: m.email, name: m.name, resend: true }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        setResendResult({ type: 'error', message: result.error || '送信失敗' });
      } else {
        setResendResult({ type: 'ok', message: `✓ ${m.name} に招待メールを再送しました` });
      }
    } catch (err) {
      setResendResult({ type: 'error', message: err.message || '送信失敗' });
    } finally {
      setResendingId(null);
      setTimeout(() => setResendResult(null), 5000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const error = await deactivateMember(deleteTarget.id);
    setDeleting(false);
    if (!error) {
      setDeleteTarget(null);
      await refresh?.();
      syncSeatCount(members.filter(m => m.id !== deleteTarget.id).length);
    }
  };

  const openAddModal = () => {
    setAddForm({ name: '', email: '', phone_number: '', position: '', start_date: '' });
    setAddSendInvite(true);
    setAddEngagementIds(new Set());
    setAddError(null);
    setAddModal(true);
  };

  const toggleAddEngagement = (id) => {
    setAddEngagementIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    setAddError(null);
    if (!addForm.name.trim()) { setAddError('氏名は必須です'); return; }
    if (addSendInvite && !addForm.email.trim()) { setAddError('招待メール送信時はメールアドレスが必須です'); return; }
    setAdding(true);
    const orgId = getOrgId();
    let newMemberId = null;

    try {
      if (addSendInvite && addForm.email.trim()) {
        // 招待メール経由（edge function）でメンバー追加
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
              email: addForm.email.trim(),
              name: addForm.name.trim(),
              orgId,
              operation_start_date: addForm.start_date || null,
            }),
          }
        );
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || '招待に失敗しました');
        newMemberId = result.memberId;
        // edge function は position='メンバー' rank='トレーニー' をデフォルトで設定する
        // これを希望の値で上書き（position と phone_number, start_date）
        if (newMemberId) {
          await supabase.from('members').update({
            position: addForm.position || null,
            phone_number: addForm.phone_number || null,
            start_date: addForm.start_date || null,
            // rank はとりあえず NULL（事業ごとに後で設定）
            rank: null,
          }).eq('id', newMemberId);
        }
      } else {
        // 直接 INSERT
        const { data, error } = await supabase.from('members').insert({
          org_id: orgId,
          name: addForm.name.trim(),
          email: addForm.email.trim() || null,
          phone_number: addForm.phone_number || null,
          position: addForm.position || null,
          start_date: addForm.start_date || null,
          is_active: true,
          incentive_rate: 0,
        }).select('id').single();
        if (error) throw new Error(error.message);
        newMemberId = data.id;
      }

      // 事業所属の登録
      if (newMemberId && addEngagementIds.size > 0) {
        const rows = Array.from(addEngagementIds).map(eid => ({
          org_id: orgId, member_id: newMemberId, engagement_id: eid,
        }));
        const { error: meErr } = await supabase.from('member_engagements').insert(rows);
        if (meErr) console.warn('member_engagements insert partially failed:', meErr.message);
      }

      // Stripe 席数同期
      syncSeatCount(members.length + 1);

      // 完了
      setAdding(false);
      setAddModal(false);
      await refresh?.();
    } catch (err) {
      setAddError(err.message || '追加に失敗しました');
      setAdding(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中…</div>;
  }

  return (
    <div style={{ background: C.offWhite, minHeight: 'calc(100vh - 120px)', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        eyebrow="MASP · 全社従業員"
        title="Members"
        description={`全従業員 ${members.length} 名 (入社日順)。${isAdmin ? '編集ボタンで個別編集' : '閲覧のみ'}`}
        right={isAdmin ? (
          <button onClick={openAddModal}
            style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: C.navy, color: C.white, border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: "'Noto Sans JP',sans-serif" }}>
            + 新規追加
          </button>
        ) : null}
      >
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="氏名 / メール / 役職 / チームで検索"
          style={{
            width: 320, padding: '7px 10px', fontSize: 12,
            border: `1px solid ${C.border}`, borderRadius: 4,
            fontFamily: "'Noto Sans JP',sans-serif",
            marginTop: 12,
          }}
        />
      </PageHeader>

      <div style={{ padding: '24px 16px 16px', overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', minWidth: 1100,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 4,
          fontSize: 12,
        }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.cream }}>
              <th style={th}>入社日</th>
              <th style={{ ...th, textAlign: 'left' }}>氏名</th>
              <th style={{ ...th, textAlign: 'left' }}>役職</th>
              <th style={{ ...th, textAlign: 'left' }}>メール</th>
              <th style={{ ...th, textAlign: 'left' }}>携帯</th>
              {engagementCols.map(e => (
                <th key={e.id} style={{ ...th, minWidth: 88 }}>{e.name}</th>
              ))}
              {isAdmin && <th style={{ ...th, width: 200 }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(m => {
              const set = assignments[m.id] || new Set();
              const isEditing = editingId === m.id;
              return (
                <tr key={m.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: isEditing ? '#FFFBEA' : 'transparent' }}>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono',monospace", color: C.textMid, whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <input type="date" value={editForm.start_date || ''} onChange={e => setEditForm(s => ({ ...s, start_date: e.target.value }))} style={editInput} />
                    ) : (m.start_date ? formatDate(m.start_date) : '—')}
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 500, color: C.navy }}>
                    {isEditing
                      ? <input value={editForm.name} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} style={editInput} />
                      : <span onClick={() => openProfile(m.id)} style={{ cursor: 'pointer' }} title="プロフィールを開く">{m.name}</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'left', color: C.textDark, fontWeight: m.position ? 600 : 400 }}>
                    {isEditing ? (
                      <select value={editForm.position} onChange={e => setEditForm(s => ({ ...s, position: e.target.value }))} style={editInput}>
                        <option value="">（なし）</option>
                        {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (m.position || '—')}
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontFamily: "'JetBrains Mono',monospace", color: C.textMid }}>
                    {isEditing
                      ? <input type="email" value={editForm.email} onChange={e => setEditForm(s => ({ ...s, email: e.target.value }))} style={editInput} />
                      : (m.email || '—')}
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontFamily: "'JetBrains Mono',monospace", color: C.textMid }}>
                    {isEditing
                      ? <input type="tel" value={editForm.phone_number} onChange={e => setEditForm(s => ({ ...s, phone_number: e.target.value }))} style={editInput} />
                      : (m.phone_number || '—')}
                  </td>
                  {engagementCols.map(e => (
                    <td key={e.id} style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={set.has(e.id)}
                        disabled={!isAdmin}
                        onChange={ev => {
                          if (!isAdmin) return;
                          toggleAssignment(m.id, e.id, ev.target.checked);
                          if (!ev.target.checked) {
                            assignMemberToTeam(m.id, e.id, null);
                          }
                        }}
                        style={{ width: 16, height: 16, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
                      />
                    </td>
                  ))}
                  {isAdmin && (
                    <td style={{ ...td, textAlign: 'center' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button onClick={saveEdit} disabled={saving} style={primarySmallBtn}>{saving ? '…' : '保存'}</button>
                          <button onClick={cancelEdit} disabled={saving} style={secondarySmallBtn}>取消</button>
                        </div>
                      ) : (
                        <div data-action-menu-root style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            onClick={() => setActionMenuId(actionMenuId === m.id ? null : m.id)}
                            title="編集メニュー"
                            style={{
                              padding: '4px 8px', fontSize: 13, fontWeight: 600,
                              background: actionMenuId === m.id ? C.navy + '12' : 'transparent',
                              color: C.navy, border: `1px solid ${C.border}`, borderRadius: 3,
                              cursor: 'pointer', fontFamily: "'Noto Sans JP'", lineHeight: 1,
                            }}
                          >✎</button>
                          {actionMenuId === m.id && (
                            <div style={{
                              position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                              minWidth: 130, zIndex: 50,
                              background: C.white, border: `1px solid ${C.border}`, borderRadius: 4,
                              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                              padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
                            }}>
                              <button
                                onClick={() => { setActionMenuId(null); startEdit(m); }}
                                style={menuItemStyle}>編集</button>
                              {m.email && (
                                <button
                                  onClick={() => { setActionMenuId(null); handleResendInvite(m); }}
                                  disabled={resendingId === m.id}
                                  style={menuItemStyle}
                                  title="招待メールを再送（パスワード未設定者向け）"
                                >{resendingId === m.id ? '送信中…' : '招待を再送'}</button>
                              )}
                              <button
                                onClick={() => { setActionMenuId(null); setDeleteTarget(m); }}
                                style={{ ...menuItemStyle, color: '#B91C1C' }}>削除</button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5 + engagementCols.length + (isAdmin ? 1 : 0)} style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight }}>
                  該当するメンバーがいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {saveError && <div style={{ marginTop: 8, fontSize: 11, color: '#DC2626' }}>{saveError}</div>}
        {resendResult && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            padding: '10px 18px', borderRadius: 4, fontSize: 12, fontWeight: 600,
            background: resendResult.type === 'error' ? '#FEF2F2' : '#ECFDF5',
            color: resendResult.type === 'error' ? '#DC2626' : '#065F46',
            border: `1px solid ${resendResult.type === 'error' ? '#FECACA' : '#A7F3D0'}`,
          }}>{resendResult.message}</div>
        )}
      </div>

      {addModal && (
        <div
          onClick={() => !adding && setAddModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 28, fontFamily: "'Noto Sans JP',sans-serif" }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 18 }}>新規メンバーを追加</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormRow label="氏名 *">
                <input value={addForm.name} onChange={e => setAddForm(s => ({ ...s, name: e.target.value }))} style={fieldStyle} />
              </FormRow>
              <FormRow label="メールアドレス">
                <input type="email" value={addForm.email} onChange={e => setAddForm(s => ({ ...s, email: e.target.value }))}
                  placeholder="例: example@ma-sp.co" style={{ ...fieldStyle, fontFamily: "'JetBrains Mono', monospace" }} />
              </FormRow>
              <FormRow label="携帯番号">
                <input type="tel" value={addForm.phone_number} onChange={e => setAddForm(s => ({ ...s, phone_number: e.target.value }))}
                  placeholder="090-1234-5678" style={{ ...fieldStyle, fontFamily: "'JetBrains Mono', monospace" }} />
              </FormRow>
              <FormRow label="役職">
                <select value={addForm.position} onChange={e => setAddForm(s => ({ ...s, position: e.target.value }))} style={fieldStyle}>
                  <option value="">（なし）</option>
                  {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </FormRow>
              <FormRow label="入社日">
                <input type="date" value={addForm.start_date} onChange={e => setAddForm(s => ({ ...s, start_date: e.target.value }))}
                  style={{ ...fieldStyle, fontFamily: "'JetBrains Mono', monospace" }} />
              </FormRow>

              <div style={{ marginTop: 8, padding: '12px 14px', background: '#F8F9FA', border: `1px solid ${C.border}`, borderRadius: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 8 }}>所属事業</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {engagementCols.map(e => (
                    <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.textDark, cursor: 'pointer' }}>
                      <input type="checkbox" checked={addEngagementIds.has(e.id)} onChange={() => toggleAddEngagement(e.id)} />
                      {e.name}
                    </label>
                  ))}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.textDark, cursor: 'pointer', marginTop: 6 }}>
                <input type="checkbox" checked={addSendInvite} onChange={e => setAddSendInvite(e.target.checked)} />
                招待メールを送信する（推奨）
              </label>
              <div style={{ fontSize: 10, color: C.textLight, marginLeft: 22, marginTop: -4, lineHeight: 1.5 }}>
                ON: メールに招待リンクを送信、本人がパスワード設定して初回ログイン<br />
                OFF: メンバー追加のみ。後でログインさせる場合は別途招待が必要
              </div>

              {addError && (
                <div style={{ fontSize: 11, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '8px 10px', borderRadius: 3 }}>
                  {addError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setAddModal(false)} disabled={adding}
                style={{ padding: '8px 18px', fontSize: 12, fontWeight: 600, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer' }}>キャンセル</button>
              <button onClick={handleAdd} disabled={adding}
                style={{ padding: '8px 22px', fontSize: 12, fontWeight: 700, background: C.navy, color: C.white, border: 'none', borderRadius: 4, cursor: adding ? 'default' : 'pointer', opacity: adding ? 0.6 : 1 }}>
                {adding ? '追加中…' : '追加する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          onClick={() => !deleting && setDeleteTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 4, width: '100%', maxWidth: 480, padding: 24, fontFamily: "'Noto Sans JP',sans-serif" }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 12 }}>メンバーを削除しますか？</div>
            <div style={{ fontSize: 13, color: C.textDark, marginBottom: 8, lineHeight: 1.6 }}>
              <b>{deleteTarget.name}</b> さんを削除します。
            </div>
            <div style={{ fontSize: 11, color: C.textMid, marginBottom: 18, lineHeight: 1.6, padding: '10px 12px', background: '#F8F9FA', borderRadius: 3, border: `1px solid ${C.border}` }}>
              ・過去の架電履歴・アポ・売上データは <b>保持</b> されます<br />
              ・本人ログイン・各画面のメンバー一覧から非表示になります
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer' }}>キャンセル</button>
              <button onClick={handleConfirmDelete} disabled={deleting}
                style={{ padding: '7px 18px', fontSize: 12, fontWeight: 700, background: '#DC2626', color: C.white, border: 'none', borderRadius: 3, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? '削除中…' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: C.navy, fontSize: 11, letterSpacing: '0.04em' };
const td = { padding: '8px 12px', fontSize: 12, color: C.textDark };
const editInput = {
  width: '100%', padding: '4px 6px', borderRadius: 3, border: `1px solid ${C.border}`,
  fontSize: 12, fontFamily: "'Noto Sans JP',sans-serif",
};
const primarySmallBtn = {
  padding: '4px 10px', fontSize: 11, fontWeight: 600,
  background: C.navy, color: C.white, border: 'none', borderRadius: 3, cursor: 'pointer',
  whiteSpace: 'nowrap', fontFamily: "'Noto Sans JP',sans-serif",
};
const secondarySmallBtn = {
  padding: '4px 10px', fontSize: 11, fontWeight: 600,
  background: C.white, color: C.navy, border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer',
  whiteSpace: 'nowrap', fontFamily: "'Noto Sans JP',sans-serif",
};
const dangerSmallBtn = {
  padding: '4px 10px', fontSize: 11, fontWeight: 600,
  background: C.white, color: '#B91C1C', border: '1px solid #FCA5A5', borderRadius: 3, cursor: 'pointer',
  whiteSpace: 'nowrap', fontFamily: "'Noto Sans JP',sans-serif",
};
const menuItemStyle = {
  padding: '6px 10px', fontSize: 11, fontWeight: 500,
  background: 'transparent', color: C.navy, border: 'none', borderRadius: 3, cursor: 'pointer',
  textAlign: 'left', whiteSpace: 'nowrap', fontFamily: "'Noto Sans JP',sans-serif",
};

function formatDate(d) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

function FormRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ minWidth: 120, fontSize: 11, color: C.textMid, fontWeight: 600 }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const fieldStyle = {
  width: '100%',
  padding: '7px 10px', borderRadius: 4, border: `1px solid ${C.border}`,
  fontSize: 12, color: C.textDark,
  fontFamily: "'Noto Sans JP', sans-serif",
};
