import React, { useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';
import { useAllMembersWithEngagements } from '../../hooks/useMemberEngagements';
import { deactivateMember } from '../../lib/supabaseWrite';
import PageHeader from '../common/PageHeader';

// MASP タブの「Members」ページ。
// 全従業員を start_date 順に並べ、事業ごとのチェックボックスで割当を管理。
// 編集は isAdmin のみ。非 admin は read-only 表示。
export default function MASPMembersView({ isAdmin }) {
  const { engagements } = useEngagements();
  const { members, assignments, teamsByEngagement, memberTeam, loading, toggleAssignment, assignMemberToTeam, refresh } = useAllMembersWithEngagements();
  const [filter, setFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const error = await deactivateMember(deleteTarget.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message || '削除に失敗しました');
      return;
    }
    setDeleteTarget(null);
    await refresh?.();
  };

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

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中…</div>;
  }

  return (
    <div style={{ background: C.offWhite, minHeight: 'calc(100vh - 120px)', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        eyebrow="MASP · 全社従業員"
        title="Members"
        description={`全従業員 ${members.length} 名 (入社日順)。チェックで事業への所属を切替${isAdmin ? '' : '（閲覧のみ）'}`}
      >
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="氏名 / メール / チーム / ポジションで検索"
          style={{
            width: 320, padding: '7px 10px', fontSize: 12,
            border: `1px solid ${C.border}`, borderRadius: 4,
            fontFamily: "'Noto Sans JP',sans-serif",
            marginTop: 12,
          }}
        />
      </PageHeader>

      <div style={{ padding: 16, overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 4,
          fontSize: 12,
        }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.cream }}>
              <th style={th}>入社日</th>
              <th style={{ ...th, textAlign: 'left' }}>氏名</th>
              {engagementCols.map(e => (
                <th key={e.id} style={{ ...th, minWidth: 96 }}>{e.name}</th>
              ))}
              {isAdmin && <th style={{ ...th, width: 64 }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(m => {
              const set = assignments[m.id] || new Set();
              return (
                <tr key={m.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono',monospace", color: C.textMid, whiteSpace: 'nowrap' }}>
                    {m.start_date ? formatDate(m.start_date) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 500, color: C.navy }}>{m.name}</td>
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
                      <button
                        onClick={() => { setDeleteTarget(m); setDeleteError(null); }}
                        title="このメンバーを削除（過去のデータは保持されます）"
                        style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 600,
                          background: '#fff', color: '#B91C1C',
                          border: `1px solid #FCA5A5`, borderRadius: 3, cursor: 'pointer',
                          fontFamily: "'Noto Sans JP',sans-serif",
                        }}
                      >削除</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={2 + engagementCols.length + (isAdmin ? 1 : 0)} style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight }}>
                  該当するメンバーがいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
              ・本人ログイン・各画面のメンバー一覧から非表示になります<br />
              ・誤って削除した場合は管理者ツールから再有効化できます
            </div>
            {deleteError && (
              <div style={{ fontSize: 11, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '8px 10px', borderRadius: 3, marginBottom: 12 }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer' }}
              >キャンセル</button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{ padding: '7px 18px', fontSize: 12, fontWeight: 700, background: '#DC2626', color: C.white, border: 'none', borderRadius: 3, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1 }}
              >{deleting ? '削除中…' : '削除する'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: C.navy, fontSize: 11, letterSpacing: '0.04em' };
const td = { padding: '8px 12px', fontSize: 12, color: C.textDark };

function formatDate(d) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}
