import React, { useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';
import { useAllMembersWithEngagements } from '../../hooks/useMemberEngagements';
import PageHeader from '../common/PageHeader';

// MASP タブの「Members」ページ。
// 全従業員を start_date 順に並べ、事業ごとのチェックボックスで割当を管理。
// 編集は isAdmin のみ。非 admin は read-only 表示。
export default function MASPMembersView({ isAdmin }) {
  const { engagements } = useEngagements();
  const { members, assignments, loading, toggleAssignment } = useAllMembersWithEngagements();
  const [filter, setFilter] = useState('');

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
              <th style={{ ...th, textAlign: 'left' }}>ポジション</th>
              <th style={{ ...th, textAlign: 'left' }}>チーム</th>
              {engagementCols.map(e => (
                <th key={e.id} style={{ ...th, minWidth: 96 }}>{e.name}</th>
              ))}
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
                  <td style={{ ...td, textAlign: 'left', color: C.textMid }}>{m.position || '—'}</td>
                  <td style={{ ...td, textAlign: 'left', color: C.textMid }}>{m.team || '—'}</td>
                  {engagementCols.map(e => (
                    <td key={e.id} style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={set.has(e.id)}
                        disabled={!isAdmin}
                        onChange={ev => {
                          if (!isAdmin) return;
                          toggleAssignment(m.id, e.id, ev.target.checked);
                        }}
                        style={{ width: 16, height: 16, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4 + engagementCols.length} style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight }}>
                  該当するメンバーがいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
