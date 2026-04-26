import React, { useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';
import { useAllMembersWithEngagements } from '../../hooks/useMemberEngagements';
import { deactivateMember, updateMemberProfile, updateMember } from '../../lib/supabaseWrite';
import PageHeader from '../common/PageHeader';

const POSITION_OPTIONS = ['', '代表取締役', '取締役', '執行役員', '監査役'];

// MASP タブの「Members」ページ。全社の従業員一覧を編集する。
export default function MASPMembersView({ isAdmin }) {
  const { engagements } = useEngagements();
  const { members, assignments, teamsByEngagement, memberTeam, loading, toggleAssignment, assignMemberToTeam, refresh } = useAllMembersWithEngagements();
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const error = await deactivateMember(deleteTarget.id);
    setDeleting(false);
    if (!error) {
      setDeleteTarget(null);
      await refresh?.();
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
        description={`全従業員 ${members.length} 名 (入社日順)。${isAdmin ? '行クリックで編集' : '閲覧のみ'}`}
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
              {isAdmin && <th style={{ ...th, width: 130 }}>操作</th>}
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
                      : m.name}
                  </td>
                  <td style={{ ...td, textAlign: 'left', color: C.textDark, fontWeight: m.position ? 600 : 400 }}>
                    {isEditing ? (
                      <select value={editForm.position} onChange={e => setEditForm(s => ({ ...s, position: e.target.value }))} style={editInput}>
                        {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p || '（なし）'}</option>)}
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
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button onClick={() => startEdit(m)} style={secondarySmallBtn}>編集</button>
                          <button onClick={() => setDeleteTarget(m)} style={dangerSmallBtn}>削除</button>
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
      </div>

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

function formatDate(d) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}
