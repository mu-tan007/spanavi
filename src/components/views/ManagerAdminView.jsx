import { useState, useMemo } from 'react';
import MyPageView from './MyPageView';
import { C } from '../../constants/colors';
import { color, space, radius, font, shadow, alpha } from '../../constants/design';
import { Button, Input, Select, Card, Badge } from '../ui';
import PageHeader from '../common/PageHeader';

const NAVY = '#0D2247';
const GRAY_200 = color.gray200;

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
      <div style={{ padding: 40, textAlign: 'center', color: color.gray400, fontSize: font.size.md }}>
        アクセス権限がありません。
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeIn 0.3s ease' }}>
      <PageHeader
        bleed={false}
        eyebrow="Admin · マネージャー"
        title="Manager"
        description="マネージャー管理パネル"
        style={{ marginBottom: 24, flexShrink: 0, padding: '14px 28px 16px' }}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Member list sidebar */}
        <div style={{
          width: 210, flexShrink: 0,
          background: color.white, borderRight: '1px solid ' + GRAY_200,
          overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid ' + GRAY_200, flexShrink: 0 }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: NAVY }}>
              {role === '営業統括' ? '全メンバー' : `${currentMemberInfo?.team}チーム`}
            </div>
            <div style={{ fontSize: font.size.xs - 1, color: color.gray400, marginTop: 2 }}>{accessibleMembers.length}名</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {accessibleMembers.map(m => (
              <button
                key={m.name}
                onClick={() => setSelectedMember(m.name)}
                style={{
                  display: 'block', width: '100%', padding: '10px 16px',
                  border: 'none', borderBottom: '1px solid ' + GRAY_200,
                  background: selectedMember === m.name ? NAVY + '08' : color.white,
                  borderLeft: selectedMember === m.name ? `3px solid ${NAVY}` : '3px solid transparent',
                  textAlign: 'left', cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                <div style={{ fontSize: font.size.sm, fontWeight: selectedMember === m.name ? font.weight.bold : font.weight.medium, color: NAVY }}>
                  {m.name}
                </div>
                <div style={{ fontSize: font.size.xs - 1, color: color.gray400, marginTop: 1 }}>
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
              height: 300, color: color.gray400, fontSize: font.size.md, flexDirection: 'column', gap: 8,
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
