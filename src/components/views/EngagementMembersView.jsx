import React, { useMemo, useState } from 'react';
import { C } from '../../constants/colors';
import { useEngagements } from '../../hooks/useEngagements';
import { useEngagementMembers } from '../../hooks/useMemberEngagements';

// 各事業タブの「Members」ページ。読み取り専用で、MASP Members で割当てたメンバーのみ表示。
// 事業を跨いで使い回せる (sourcing / career / capital …)。
export default function EngagementMembersView({ engagementOverride, bleed = true }) {
  const { currentEngagement } = useEngagements();
  const engagement = engagementOverride || currentEngagement;
  const { members, loading } = useEngagementMembers(engagement?.id);
  const [filter, setFilter] = useState('');

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

  if (!engagement) return null;
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textMid }}>読み込み中…</div>;
  }

  return (
    <div style={{ background: C.offWhite, margin: bleed ? -28 : 0, marginTop: 0, marginBottom: 0, minHeight: 'calc(100vh - 120px)' }}>
      <div style={{ padding: '14px 20px 16px', background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>
          {engagement.name} · 所属メンバー
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 2px', color: C.navy, fontFamily: "'Outfit','Noto Sans JP',sans-serif" }}>
          Members
        </h1>
        <p style={{ fontSize: 11, color: C.textMid, margin: '0 0 12px' }}>
          {members.length} 名 (入社日順)。所属の変更は MASP → Members から
        </p>
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="氏名 / メール / チーム / ポジションで検索"
          style={{
            width: 320, padding: '7px 10px', fontSize: 12,
            border: `1px solid ${C.border}`, borderRadius: 4,
            fontFamily: "'Noto Sans JP',sans-serif",
          }}
        />
      </div>

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
              <th style={{ ...th, textAlign: 'left' }}>メール</th>
              <th style={th}>ランク</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(m => (
              <tr key={m.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ ...td, fontFamily: "'JetBrains Mono',monospace", color: C.textMid, whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {m.start_date ? m.start_date : '—'}
                </td>
                <td style={{ ...td, textAlign: 'left', fontWeight: 500, color: C.navy }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: C.navy, color: C.white,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 600, overflow: 'hidden', flexShrink: 0,
                    }}>
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (m.name || '?')[0]}
                    </div>
                    {m.name}
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'left', color: C.textMid }}>{m.position || '—'}</td>
                <td style={{ ...td, textAlign: 'left', color: C.textMid }}>{m.team || '—'}</td>
                <td style={{ ...td, textAlign: 'left', color: C.textMid, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>{m.email || '—'}</td>
                <td style={{ ...td, color: C.textMid, textAlign: 'center' }}>{m.rank || '—'}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '40px 12px', textAlign: 'center', color: C.textLight }}>
                  この事業に所属するメンバーはいません
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
