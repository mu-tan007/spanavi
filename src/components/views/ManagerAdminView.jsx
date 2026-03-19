import { useState, useMemo } from 'react';
import MyPageView from './MyPageView';
import { C } from '../../constants/colors';

const NAVY = '#0D2247';
const GRAY_200 = '#E5E7EB';

export default function ManagerAdminView({ currentUser, members = [], appoData = [], now }) {
  const [selectedMember, setSelectedMember] = useState(null);

  const currentMemberInfo = useMemo(
    () => members.find(m => m.name === currentUser),
    [members, currentUser]
  );

  const role = currentMemberInfo?.role || '';

  const accessibleMembers = useMemo(() => {
    const active = members.filter(m => m.name && m.is_active !== false);
    if (role === '営業統括') return active;
    if (role === 'チームリーダー') return active.filter(m => m.team === currentMemberInfo?.team);
    return [];
  }, [members, role, currentMemberInfo]);

  const selectedMemberInfo = useMemo(
    () => members.find(m => m.name === selectedMember),
    [members, selectedMember]
  );

  if (role !== 'チームリーダー' && role !== '営業統括') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
        アクセス権限がありません。
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '1px solid #0D2247', flexShrink: 0, padding: '0 28px 14px' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#0D2247', letterSpacing: '-0.3px' }}>Manager</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>マネージャー管理パネル</div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Member list sidebar */}
        <div style={{
          width: 210, flexShrink: 0,
          background: '#fff', borderRight: '1px solid ' + GRAY_200,
          overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid ' + GRAY_200, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>
              {role === '営業統括' ? '全メンバー' : `${currentMemberInfo?.team}チーム`}
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{accessibleMembers.length}名</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {accessibleMembers.map(m => (
              <button
                key={m.name}
                onClick={() => setSelectedMember(m.name)}
                style={{
                  display: 'block', width: '100%', padding: '10px 16px',
                  border: 'none', borderBottom: '1px solid ' + GRAY_200,
                  background: selectedMember === m.name ? NAVY + '08' : '#fff',
                  borderLeft: selectedMember === m.name ? `3px solid ${NAVY}` : '3px solid transparent',
                  textAlign: 'left', cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: selectedMember === m.name ? 700 : 500, color: NAVY }}>
                  {m.name}
                </div>
                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
                  {m.team ? m.team + 'チーム' : ''}{m.rank ? ' · ' + m.rank : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* MyPage content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {selectedMember ? (
            <MyPageView
              currentUser={selectedMember}
              userId={selectedMemberInfo?._supaId || selectedMember}
              members={members}
              now={now}
              appoData={appoData}
              isAdmin={false}
            />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 300, color: '#9CA3AF', fontSize: 14, flexDirection: 'column', gap: 8,
            }}>
              <span style={{ fontSize: 32 }}>👤</span>
              左のリストからメンバーを選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
