import React, { useMemo, useState, useEffect } from 'react';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge, Tag } from '../ui';
import { supabase } from '../../lib/supabase';
import { useEngagements } from '../../hooks/useEngagements';
import { useAllMembersWithEngagements } from '../../hooks/useMemberEngagements';
import { deactivateMember, updateMemberProfile, updateMember } from '../../lib/supabaseWrite';
import { getOrgId } from '../../lib/orgContext';
import PageHeader from '../common/PageHeader';
import { useMemberProfile } from '../common/MemberProfileDrawer';
import ContractTemplateManager from './masp/ContractTemplateManager';
import GenerateContractModal from './masp/GenerateContractModal';

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

  // 業務委託契約書生成モーダル
  const [contractTarget, setContractTarget] = useState(null);

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
      } else if (result.existingUser) {
        setResendResult({ type: 'ok', message: `${m.name} にパスワード再設定メールを送信しました` });
      } else {
        setResendResult({ type: 'ok', message: `${m.name} に招待メールを再送しました` });
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
        // 既存Authユーザー検出時は recovery メール送信なので、画面にトーストで通知
        if (result.existingUser) {
          setResendResult({
            type: 'ok',
            message: `${addForm.email.trim()} は登録済みのため、パスワード再設定メールを送信しました`,
          });
          setTimeout(() => setResendResult(null), 6000);
        } else {
          setResendResult({
            type: 'ok',
            message: `${addForm.email.trim()} に招待メールを送信しました`,
          });
          setTimeout(() => setResendResult(null), 6000);
        }
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
    return <div style={{ padding: 40, textAlign: 'center', color: color.textMid }}>読み込み中…</div>;
  }

  const positionSelectOptions = [
    { value: '', label: '（なし）' },
    ...positionOptions.map(p => ({ value: p, label: p })),
  ];

  return (
    <div style={{ background: color.offWhite, minHeight: 'calc(100vh - 120px)', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        eyebrow="MASP · 全社従業員"
        title="Members"
        description={`全従業員 ${members.length} 名 (入社日順)。${isAdmin ? '編集ボタンで個別編集' : '閲覧のみ'}`}
        right={isAdmin ? (
          <Button size="sm" onClick={openAddModal}>+ 新規追加</Button>
        ) : null}
      >
        <Input
          size="sm"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="氏名 / メール / 役職 / チームで検索"
          fullWidth={false}
          containerStyle={{ width: 320, marginTop: 12 }}
        />
      </PageHeader>

      <div style={{ padding: '24px 16px 0' }}>
        <ContractTemplateManager isAdmin={isAdmin} />
      </div>

      <div style={{ padding: '8px 16px 16px', overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', minWidth: 1100,
          background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
          fontSize: font.size.sm,
        }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${color.border}`, background: color.cream }}>
              <th style={th}>入社日</th>
              <th style={{ ...th, textAlign: 'left' }}>氏名</th>
              <th style={{ ...th, textAlign: 'left' }}>役職</th>
              <th style={{ ...th, textAlign: 'left' }}>メール</th>
              <th style={{ ...th, textAlign: 'left' }}>携帯</th>
              {engagementCols.map(e => (
                <th key={e.id} style={{ ...th, minWidth: 88 }}>{e.name}</th>
              ))}
              {isAdmin && <th style={{ ...th, width: 36, padding: 0 }} aria-label="操作"></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(m => {
              const set = assignments[m.id] || new Set();
              const isEditing = editingId === m.id;
              return (
                <tr key={m.id} style={{ borderBottom: `1px solid ${color.borderLight}`, background: isEditing ? '#FFFBEA' : 'transparent' }}>
                  <td style={{ ...td, fontFamily: font.family.mono, color: color.textMid, whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <Input size="sm" type="date" value={editForm.start_date || ''} onChange={e => setEditForm(s => ({ ...s, start_date: e.target.value }))} />
                    ) : (m.start_date ? formatDate(m.start_date) : '—')}
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: font.weight.medium, color: color.navy }}>
                    {isEditing
                      ? <Input size="sm" value={editForm.name} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} />
                      : <span onClick={() => openProfile(m.id)} style={{ cursor: 'pointer' }} title="プロフィールを開く">{m.name}</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'left', color: color.textDark, fontWeight: m.position ? font.weight.semibold : font.weight.normal }}>
                    {isEditing ? (
                      <Select
                        size="sm"
                        value={editForm.position}
                        onChange={e => setEditForm(s => ({ ...s, position: e.target.value }))}
                        options={positionSelectOptions}
                      />
                    ) : (m.position || '—')}
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontFamily: font.family.mono, color: color.textMid }}>
                    {isEditing
                      ? <Input size="sm" type="email" value={editForm.email} onChange={e => setEditForm(s => ({ ...s, email: e.target.value }))} />
                      : (m.email || '—')}
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontFamily: font.family.mono, color: color.textMid }}>
                    {isEditing
                      ? <Input size="sm" type="tel" value={editForm.phone_number} onChange={e => setEditForm(s => ({ ...s, phone_number: e.target.value }))} />
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
                    <td style={{ ...td, textAlign: 'center', width: 36, padding: '4px 4px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <Button size="sm" loading={saving} onClick={saveEdit}>{saving ? '…' : '保存'}</Button>
                          <Button size="sm" variant="secondary" disabled={saving} onClick={cancelEdit}>取消</Button>
                        </div>
                      ) : (
                        <div data-action-menu-root style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            onClick={() => setActionMenuId(actionMenuId === m.id ? null : m.id)}
                            title="編集メニュー"
                            style={{
                              width: 24, height: 24, padding: 0, fontSize: 13,
                              background: actionMenuId === m.id ? alpha(color.navy, 0.07) : 'transparent',
                              color: color.textMid, border: 'none', borderRadius: radius.sm,
                              cursor: 'pointer', fontFamily: font.family.sans, lineHeight: 1,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = alpha(color.navy, 0.07); e.currentTarget.style.color = color.navy; }}
                            onMouseLeave={e => { e.currentTarget.style.background = actionMenuId === m.id ? alpha(color.navy, 0.07) : 'transparent'; e.currentTarget.style.color = actionMenuId === m.id ? color.navy : color.textMid; }}
                          >✎</button>
                          {actionMenuId === m.id && (
                            <div style={{
                              position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                              minWidth: 130, zIndex: 50,
                              background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.md,
                              boxShadow: shadow.md,
                              padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
                            }}>
                              <button
                                onClick={() => { setActionMenuId(null); startEdit(m); }}
                                style={menuItemStyle}>編集</button>
                              <button
                                onClick={() => { setActionMenuId(null); setContractTarget(m); }}
                                style={menuItemStyle}
                                title="業務委託契約書を差し込み生成"
                              >契約書を生成</button>
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
                                style={{ ...menuItemStyle, color: color.danger }}>削除</button>
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
                <td colSpan={5 + engagementCols.length + (isAdmin ? 1 : 0)} style={{ padding: '40px 12px', textAlign: 'center', color: color.textLight }}>
                  該当するメンバーがいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {saveError && <div style={{ marginTop: 8, fontSize: font.size.xs, color: color.danger }}>{saveError}</div>}
        {resendResult && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            padding: '10px 18px', borderRadius: radius.md, fontSize: font.size.sm, fontWeight: font.weight.semibold,
            background: resendResult.type === 'error' ? alpha(color.danger, 0.06) : alpha(color.success, 0.08),
            color: resendResult.type === 'error' ? color.danger : '#065F46',
            border: `1px solid ${resendResult.type === 'error' ? alpha(color.danger, 0.25) : alpha(color.success, 0.3)}`,
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
            style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 28, fontFamily: font.family.sans, boxShadow: shadow.xl }}
          >
            <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.navy, marginBottom: 18 }}>新規メンバーを追加</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormRow label="氏名 *">
                <Input size="sm" value={addForm.name} onChange={e => setAddForm(s => ({ ...s, name: e.target.value }))} />
              </FormRow>
              <FormRow label="メールアドレス">
                <Input
                  size="sm"
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm(s => ({ ...s, email: e.target.value }))}
                  placeholder="例: example@ma-sp.co"
                  style={{ fontFamily: font.family.mono }}
                />
              </FormRow>
              <FormRow label="携帯番号">
                <Input
                  size="sm"
                  type="tel"
                  value={addForm.phone_number}
                  onChange={e => setAddForm(s => ({ ...s, phone_number: e.target.value }))}
                  placeholder="090-1234-5678"
                  style={{ fontFamily: font.family.mono }}
                />
              </FormRow>
              <FormRow label="役職">
                <Select
                  size="sm"
                  value={addForm.position}
                  onChange={e => setAddForm(s => ({ ...s, position: e.target.value }))}
                  options={positionSelectOptions}
                />
              </FormRow>
              <FormRow label="入社日">
                <Input
                  size="sm"
                  type="date"
                  value={addForm.start_date}
                  onChange={e => setAddForm(s => ({ ...s, start_date: e.target.value }))}
                  style={{ fontFamily: font.family.mono }}
                />
              </FormRow>

              <div style={{ marginTop: 8, padding: '12px 14px', background: color.gray50, border: `1px solid ${color.border}`, borderRadius: radius.md }}>
                <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.navy, marginBottom: 8 }}>所属事業</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {engagementCols.map(e => (
                    <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: font.size.sm, color: color.textDark, cursor: 'pointer' }}>
                      <input type="checkbox" checked={addEngagementIds.has(e.id)} onChange={() => toggleAddEngagement(e.id)} />
                      {e.name}
                    </label>
                  ))}
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: font.size.sm, color: color.textDark, cursor: 'pointer', marginTop: 6 }}>
                <input type="checkbox" checked={addSendInvite} onChange={e => setAddSendInvite(e.target.checked)} />
                招待メールを送信する（推奨）
              </label>
              <div style={{ fontSize: 10, color: color.textLight, marginLeft: 22, marginTop: -4, lineHeight: 1.5 }}>
                ON: メールに招待リンクを送信、本人がパスワード設定して初回ログイン<br />
                OFF: メンバー追加のみ。後でログインさせる場合は別途招待が必要
              </div>

              {addError && (
                <div style={{ fontSize: font.size.xs, color: color.danger, background: alpha(color.danger, 0.06), border: `1px solid ${alpha(color.danger, 0.3)}`, padding: '8px 10px', borderRadius: radius.sm }}>
                  {addError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
              <Button variant="secondary" disabled={adding} onClick={() => setAddModal(false)}>キャンセル</Button>
              <Button loading={adding} onClick={handleAdd}>{adding ? '追加中…' : '追加する'}</Button>
            </div>
          </div>
        </div>
      )}

      {contractTarget && (
        <GenerateContractModal
          member={contractTarget}
          onClose={() => setContractTarget(null)}
          onGenerated={(res) => {
            setResendResult({ type: 'ok', message: `${res.filename} をダウンロードしました` });
            setTimeout(() => setResendResult(null), 5000);
            refresh?.();
          }}
        />
      )}

      {deleteTarget && (
        <div
          onClick={() => !deleting && setDeleteTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: color.white, border: `1px solid ${color.border}`, borderRadius: radius.lg, width: '100%', maxWidth: 480, padding: 24, fontFamily: font.family.sans, boxShadow: shadow.xl }}
          >
            <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.navy, marginBottom: 12 }}>メンバーを削除しますか？</div>
            <div style={{ fontSize: font.size.base, color: color.textDark, marginBottom: 8, lineHeight: font.lineHeight.relaxed }}>
              <b>{deleteTarget.name}</b> さんを削除します。
            </div>
            <div style={{ fontSize: font.size.xs, color: color.textMid, marginBottom: 18, lineHeight: font.lineHeight.relaxed, padding: '10px 12px', background: color.gray50, borderRadius: radius.sm, border: `1px solid ${color.border}` }}>
              ・過去の架電履歴・アポ・売上データは <b>保持</b> されます<br />
              ・本人ログイン・各画面のメンバー一覧から非表示になります
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>キャンセル</Button>
              <Button size="sm" variant="danger" loading={deleting} onClick={handleConfirmDelete}>
                {deleting ? '削除中…' : '削除する'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'center', fontWeight: font.weight.semibold, color: color.navy, fontSize: font.size.xs, letterSpacing: font.letterSpacing.wide };
const td = { padding: '8px 12px', fontSize: font.size.sm, color: color.textDark };
const menuItemStyle = {
  padding: '6px 10px', fontSize: font.size.xs, fontWeight: font.weight.medium,
  background: 'transparent', color: color.navy, border: 'none', borderRadius: radius.sm, cursor: 'pointer',
  textAlign: 'left', whiteSpace: 'nowrap', fontFamily: font.family.sans,
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
      <div style={{ minWidth: 120, fontSize: font.size.xs, color: color.textMid, fontWeight: font.weight.semibold }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
